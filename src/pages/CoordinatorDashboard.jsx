import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, FileSpreadsheet, LogOut, Search, Download, Mail, Trash2, Plus, X, RotateCcw, BarChart3, Calendar, FileText, Ticket, MessageSquare, AlertTriangle, TrendingUp, UserCheck } from 'lucide-react';
import { read, utils } from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import API from '../api/axios';
import toast from 'react-hot-toast';

const formatExcelDateSafely = (excelDate) => {
  if (!excelDate) return new Date().toISOString().split('T')[0];
  const d = new Date(excelDate);
  d.setHours(d.getHours() + 12); 
  return d.toISOString().split('T')[0];
};

const getUniqueOrdersById = (orderList) => {
  const uniqueMap = new Map();
  orderList.forEach((order) => {
    if (order?._id && !uniqueMap.has(order._id)) {
      uniqueMap.set(order._id, order);
    }
  });
  return Array.from(uniqueMap.values());
};

const CoordinatorDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('activeCoordinatorTab') || 'faculty');
  const [faculty, setFaculty] = useState([]);
  const [guests, setGuests] = useState([]); 
  const [orders, setOrders] = useState([]); 
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);
  
  const [yearScope, setYearScope] = useState(''); 
  const [reportYearFilter, setReportYearFilter] = useState(''); 
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const fileInputRef = useRef(null);

  const deptId = sessionStorage.getItem('deptId');
  const deptCode = sessionStorage.getItem('deptCode') || 'UNKNOWN';
  const userName = sessionStorage.getItem('userName') || 'Coordinator'; 
  const deptName = sessionStorage.getItem('deptName') || 'Department';

  const isMTech = deptName.includes('M.Tech');
  const availableYears = isMTech 
    ? ["1st Yr (Regular)", "1st Yr (Backlog)", "2nd Yr (Regular)", "2nd Yr (Backlog)"]
    : ["2nd Yr (Regular)", "2nd Yr (Backlog)", "3rd Yr (Regular)", "3rd Yr (Backlog)", "4th Yr (Regular)"];

  const [formData, setFormData] = useState({ 
      fullName: '', email: '', mobile: '', 
      academicYear: isMTech ? '1st Yr (Regular)' : '2nd Yr (Regular)', 
      assignedSubject: '',
      validFrom: new Date().toISOString().split('T')[0], 
      validTill: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString().split('T')[0] 
  });

  const [guestFormData, setGuestFormData] = useState({
    guestName: '', facultyVoucher: '',
    validFrom: new Date().toISOString().split('T')[0], 
    validTill: new Date().toISOString().split('T')[0]
  });
  const [actionLocks, setActionLocks] = useState({
    exportFaculty: false,
    resetSystem: false,
    bulkUpload: false,
    addFaculty: false,
    addGuest: false,
    exportOrders: false,
    exportPdf: false,
    deletingFacultyId: null,
    sendingEmailId: null,
    sendingBulkEmail: false
  });

  useEffect(() => { sessionStorage.setItem('activeCoordinatorTab', activeTab); }, [activeTab]);
  useEffect(() => { if (deptId) { fetchFaculty(); fetchOrders(); fetchGuests(); } }, [deptId]);

  const fetchFaculty = async () => { try { const res = await API.get(`/faculty/department/${deptId}`); setFaculty(res.data); } catch (err) { console.error("Error", err); } };
  const fetchGuests = async () => { try { const res = await API.get(`/guests/department/${deptId}`); setGuests(res.data); } catch (err) { console.error("Error fetching guests", err); } };
  const fetchOrders = async () => { try { const res = await API.get(`/orders/department/${deptId}`); setOrders(res.data); } catch (err) { console.error("Error fetching orders", err); } };

  const totalExaminers = faculty.length;
  const now = new Date();
  const activeVouchers = faculty.filter(f => {
    const validFrom = new Date(f.validFrom);
    const validTill = new Date(f.validTill);
    return now >= validFrom && now <= validTill;
  }).length;
  const pendingExpired = totalExaminers - activeVouchers;

  const filteredOrders = orders.filter(order => {
    if (startDate || endDate) {
        const orderDate = new Date(order.orderDate || order.createdAt);
        orderDate.setHours(0, 0, 0, 0);
        const start = startDate ? new Date(startDate) : new Date('2000-01-01');
        const end = endDate ? new Date(endDate) : new Date('2100-01-01');
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        if (orderDate < start || orderDate > end) return false;
    }
    if (reportYearFilter !== '') {
        const facultyYear = order.facultyId?.academicYear;
        if (facultyYear !== reportYearFilter) return false;
    }
    return true;
  });

  const reportOrders = getUniqueOrdersById(
    filteredOrders.filter((order) => order.status === 'Completed')
  );

  const totalSpent = reportOrders.reduce((sum, order) => sum + order.totalAmount, 0);
  const totalOrders = reportOrders.length;

  // 🚀 NEW COORDINATOR ANALYTICS 1: Year-wise spending breakdown
  const yearWiseStats = availableYears.map(year => {
    const total = reportOrders.filter(o => o.facultyId?.academicYear === year).reduce((sum, o) => sum + o.totalAmount, 0);
    return { year, total };
  }).filter(s => s.total > 0);

  // 🚀 NEW COORDINATOR ANALYTICS 2: Activity Insights
  const topExaminer = faculty.map(f => ({
    name: f.fullName,
    count: orders.filter(o => o.facultyId?._id === f._id).length
  })).sort((a,b) => b.count - a.count)[0];

  const handleExportCSV = async () => {
    if (actionLocks.exportFaculty) return;
    setActionLocks(prev => ({ ...prev, exportFaculty: true }));
    try {
      const exportData = faculty.map(f => ({
        "Faculty Name": f.fullName, "Email": f.email, "Mobile": f.mobile, "Year Scope": f.academicYear,
        "Assigned Subjects": f.assignedSubjects ? f.assignedSubjects.map(s => s.split('|').length === 3 ? s.split('|')[2] : s).join(', ') : 'N/A', 
        "Voucher Code": f.voucherCode, "Valid From": new Date(f.validFrom).toLocaleDateString(), "Valid Till": new Date(f.validTill).toLocaleDateString()
      }));
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Faculty");
      XLSX.writeFile(workbook, `${deptCode}_Faculty_Vouchers.xlsx`);
      toast.success("CSV Downloaded!");
    } finally {
      setActionLocks(prev => ({ ...prev, exportFaculty: false }));
    }
  };

  const handleExportReportsCSV = async () => {
    if (actionLocks.exportOrders) return;
    setActionLocks(prev => ({ ...prev, exportOrders: true }));
    try {
      const exportData = reportOrders.map(o => {
        const isGuest = o.voucherCode?.startsWith('G-');
        const actualGuestName = o.guestName || guests.find(g => g.voucherCode === o.voucherCode)?.guestName || 'Guest';
        const hostName = o.facultyId?.fullName || "Deleted User";
        return {
          "Date": new Date(o.orderDate || o.createdAt).toLocaleDateString(),
          "Time": new Date(o.orderDate || o.createdAt).toLocaleTimeString(),
          "Billed To": isGuest ? `${actualGuestName} (Guest)` : hostName,
          "Host Faculty": isGuest ? hostName : "N/A",
          "Year Scope": o.facultyId?.academicYear || "N/A",
          "Voucher Code": o.voucherCode || "N/A",
          "Items Ordered": o.items.map(i => `${i.itemName} (x${i.quantity})`).join(', '),
          "Amount (₹)": o.totalAmount
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Billing Report");
      XLSX.writeFile(workbook, `${deptCode}_Billing_Report_${reportYearFilter || 'All'}.xlsx`);
      toast.success("Excel Report Downloaded!");
    } finally {
      setActionLocks(prev => ({ ...prev, exportOrders: false }));
    }
  };

  const buildVoucherMessage = (member) => {
    const examCategory = member.academicYear || 'N/A';
    return `*PICT EXAM PORTAL - CANTEEN VOUCHER*\n\nDear Prof. *${member.fullName}*,\n\nYou have been assigned as an examiner for the *${deptCode}* Department.\n\n*VOUCHER DETAILS:*\n• *Exam Category:* ${examCategory}\n• *Access Code:* ${member.voucherCode}\n• *Valid From:* ${new Date(member.validFrom).toLocaleDateString('en-GB')}\n• *Valid Until:* ${new Date(member.validTill).toLocaleDateString('en-GB')}\n\n*PORTAL LINK:*\nhttps://pict-canteen-fronted.vercel.app/\n\n_Please enter your access code at the portal link above to place orders._`;
  };

  const buildEmailVoucherMessage = (member) => {
    const examCategory = member.academicYear || 'N/A';
    return `PICT EXAM PORTAL - CANTEEN VOUCHER\n\nDear Prof. ${member.fullName},\n\nYou have been assigned as an examiner for the ${deptCode} Department.\n\nVOUCHER DETAILS:\n• Exam Category: ${examCategory}\n• Access Code: ${member.voucherCode}\n• Valid From: ${new Date(member.validFrom).toLocaleDateString('en-GB')}\n• Valid Until: ${new Date(member.validTill).toLocaleDateString('en-GB')}\n\nPORTAL LINK:\nhttps://pict-canteen-fronted.vercel.app/\n\nPlease enter your access code at the portal link above to place orders.`;
  };

  const generatePDFInvoice = () => {
    if (actionLocks.exportPdf) return;
    setActionLocks(prev => ({ ...prev, exportPdf: true }));
    const doc = new jsPDF();
    const img = new Image();
    img.src = '/image1.jpeg'; 
    img.onload = () => {
      // Add a faint center watermark like the manager report.
      doc.setGState(new doc.GState({ opacity: 0.15 }));
      doc.addImage(img, 'JPEG', 35, 70, 140, 140);
      doc.setGState(new doc.GState({ opacity: 1.0 })); 
      doc.addImage(img, 'JPEG', 14, 10, 22, 22);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("SCTR'S PUNE INSTITUTE OF COMPUTER TECHNOLOGY", 42, 18);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text("Office of the Mess & Canteen Section", 42, 24);
      doc.rect(55, 30, 100, 8);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("DEPARTMENT-WISE BILLING REPORT", 62, 36);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const refNo = `Ref No: PICT/CNTN/${dateStr}/${deptCode}-01`;
      const dateRangeText = `Date: ${startDate ? new Date(startDate).toLocaleDateString('en-GB') : 'All'} to ${endDate ? new Date(endDate).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB')}`;
      doc.text(refNo, 14, 50);
      doc.text(dateRangeText, 140, 50);
      doc.setFont("helvetica", "bold");
      const yearText = reportYearFilter ? `(${reportYearFilter.toUpperCase()})` : "ALL YEARS";
      doc.text(`Department: ${deptCode} DEPARTMENT ${yearText}`, 14, 58);

      const facultyOrders = reportOrders.filter(o => !o.voucherCode?.startsWith('G-'));
      const guestOrders = reportOrders.filter(o => o.voucherCode?.startsWith('G-'));

      const facultyTotals = {};
      facultyOrders.forEach(order => {
          const rawDateObj = new Date(order.createdAt || order.orderDate);
          const rawDate = rawDateObj.toLocaleDateString('en-GB');
          const orderDateIso = rawDateObj.toISOString().split('T')[0];
          const baseName = order.facultyId?.fullName || 'Deleted/Unknown User';
          const matchedFaculty = faculty.find(f => f.voucherCode === order.voucherCode || (order.facultyId && f._id === (order.facultyId._id || order.facultyId)));
          const yearScopeFac = matchedFaculty?.academicYear || 'N/A';
          let activeSubjects = 'No Subjects';
          if (matchedFaculty?.assignedSubjects && matchedFaculty.assignedSubjects.length > 0) {
              const relevantSubs = matchedFaculty.assignedSubjects.filter(sub => {
                  const parts = sub.split('|');
                  if (parts.length === 3) return orderDateIso >= parts[0] && orderDateIso <= parts[1];
                  return true; 
              }).map(sub => {
                  const parts = sub.split('|');
                  return parts.length === 3 ? parts[2] : sub;
              });
              activeSubjects = relevantSubs.length > 0 ? relevantSubs.join(', ') : "Off-Duty / No Exam";
          }
          const groupingKey = `${baseName}_${rawDate}`; 
          if (!facultyTotals[groupingKey]) {
              facultyTotals[groupingKey] = { displayName: baseName, date: rawDate, yearAndSubs: `${yearScopeFac}\n${activeSubjects}`, items: [], total: 0 };
          }
          facultyTotals[groupingKey].total += order.totalAmount;
          facultyTotals[groupingKey].items.push(order.items.map(i => `${i.itemName}(x${i.quantity})`).join(', '));
      });

      const guestTotals = {};
      guestOrders.forEach(order => {
          const rawDateObj = new Date(order.createdAt || order.orderDate);
          const rawDate = rawDateObj.toLocaleDateString('en-GB');
          const orderDateIso = rawDateObj.toISOString().split('T')[0];
          const actualGuestName = order.guestName || guests.find(g => g.voucherCode === order.voucherCode)?.guestName || 'Guest';
          const baseName = `${actualGuestName} \n(Host: ${order.facultyId?.fullName || 'Unknown'})`;
          const hostFaculty = faculty.find(f => order.facultyId && f._id === (order.facultyId._id || order.facultyId));
          const yearScopeHost = hostFaculty?.academicYear || 'N/A';
          let activeSubjects = 'No Subjects';
          if (hostFaculty?.assignedSubjects && hostFaculty.assignedSubjects.length > 0) {
              const relevantSubs = hostFaculty.assignedSubjects.filter(sub => {
                  const parts = sub.split('|');
                  if (parts.length === 3) return orderDateIso >= parts[0] && orderDateIso <= parts[1];
                  return true;
              }).map(sub => {
                  const parts = sub.split('|');
                  return parts.length === 3 ? parts[2] : sub;
              });
              activeSubjects = relevantSubs.length > 0 ? relevantSubs.join(', ') : "Off-Duty / No Exam";
          }
          const groupingKey = `${baseName}_${rawDate}`;
          if (!guestTotals[groupingKey]) {
             guestTotals[groupingKey] = { displayName: baseName, date: rawDate, yearAndSubs: `${yearScopeHost}\n${activeSubjects}`, items: [], total: 0 };
          }
          guestTotals[groupingKey].total += order.totalAmount;
          guestTotals[groupingKey].items.push(order.items.map(i => `${i.itemName}(x${i.quantity})`).join(', '));
      });

      let currentY = 70;
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("SECTION A: FACULTY CONSUMPTION", 14, currentY);
      const facultyTableData = Object.values(facultyTotals).map((data, index) => [ index + 1, data.date, data.displayName, data.yearAndSubs, data.items.join(' | '), `Rs. ${data.total}` ]);
      const facultySum = Object.values(facultyTotals).reduce((sum, val) => sum + val.total, 0);
      autoTable(doc, {
        startY: currentY + 3,
        head: [['Sr', 'Date', 'Faculty Name', 'Year & Specific Subject', 'Items Consumed', 'Total (Rs)']], 
        body: facultyTableData.length ? facultyTableData : [['-', '-', 'No Faculty Orders', '-', '-', '-']],
        theme: 'grid', headStyles: { fillColor: [50, 50, 50] }, bodyStyles: { fillColor: false }, 
        alternateRowStyles: { fillColor: false }, styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 1: { cellWidth: 20 }, 5: { halign: 'right', cellWidth: 20 } }
      });
      currentY = doc.lastAutoTable.finalY;
      doc.text(`Sub-Total (Faculty): Rs. ${facultySum}/-`, 140, currentY + 8);
      currentY += 18;
      doc.text("SECTION B: GUEST/EXTERNAL CONSUMPTION", 14, currentY);
      const guestTableData = Object.values(guestTotals).map((data, index) => [ index + 1, data.date, data.displayName, data.yearAndSubs, data.items.join(' | '), `Rs. ${data.total}` ]);
      const guestSum = Object.values(guestTotals).reduce((sum, val) => sum + val.total, 0);
      autoTable(doc, {
        startY: currentY + 3,
        head: [['Sr', 'Date', 'Guest Details', 'Year & Specific Subject', 'Items Consumed', 'Total (Rs)']], 
        body: guestTableData.length ? guestTableData : [['-', '-', 'No Guest Orders', '-', '-', '-']],
        theme: 'grid', headStyles: { fillColor: [50, 50, 50] }, bodyStyles: { fillColor: false }, 
        alternateRowStyles: { fillColor: false }, styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 1: { cellWidth: 20 }, 5: { halign: 'right', cellWidth: 20 } }
      });
      currentY = doc.lastAutoTable.finalY;
      doc.text(`Sub-Total (Guest): Rs. ${guestSum}/-`, 140, currentY + 8);
      const grandTotal = facultySum + guestSum;
      doc.rect(130, currentY + 15, 66, 10);
      doc.setFontSize(12);
      doc.text(`GRAND TOTAL`, 135, currentY + 22);
      doc.text(`Rs. ${grandTotal}`, 175, currentY + 22);
      const pageHeight = doc.internal.pageSize.getHeight();
      let signatureY = currentY + 50; 
      if (signatureY + 30 > pageHeight - 20) { doc.addPage(); signatureY = 40; }
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.line(20, signatureY, 60, signatureY); doc.text("MESS MANAGER", 25, signatureY + 6);
      doc.line(85, signatureY, 135, signatureY); doc.text("PRACTICAL COORDINATOR", 87, signatureY + 6);
      doc.line(160, signatureY, 200, signatureY); doc.text("HEAD OF DEPARTMENT", 162, signatureY + 6);
      doc.line(45, signatureY + 25, 85, signatureY + 25); doc.text("CEO", 60, signatureY + 31);
      doc.line(135, signatureY + 25, 175, signatureY + 25); doc.text("PRINCIPAL", 148, signatureY + 31);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7);
      const downloadTime = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
      doc.text(`SYSTEM GENERATED REPORT | PICT CANTEEN & MESS SECTION | DOWNLOADED: ${downloadTime.toUpperCase()}`, 48, pageHeight - 5);
      doc.save(`${deptCode}_Billing_Report_${reportYearFilter || 'All'}.pdf`);
      toast.success("PDF Report Downloaded!"); 
      setActionLocks(prev => ({ ...prev, exportPdf: false }));
    };
    img.onerror = () => {
      toast.error("Failed to load watermark image.");
      setActionLocks(prev => ({ ...prev, exportPdf: false }));
    }; 
  };

  const handleDelete = async (id) => {
    if (actionLocks.deletingFacultyId) return;
    if (window.confirm("Are you sure you want to revoke this voucher and remove the examiner?")) {
      setActionLocks(prev => ({ ...prev, deletingFacultyId: id }));
      try { await API.delete(`/faculty/remove/${id}`); toast.success("Examiner deleted and voucher revoked."); fetchFaculty(); } 
      catch (err) { toast.error("Failed to delete."); } 
      finally { setActionLocks(prev => ({ ...prev, deletingFacultyId: null })); }
    }
  };

  const handleResetSystem = async () => {
     if (actionLocks.resetSystem) return;
     if(window.confirm(`WARNING: This will deactivate ALL faculty records for ${deptCode}. Are you absolutely sure?`)) {
       setActionLocks(prev => ({ ...prev, resetSystem: true }));
         try { await API.delete(`/faculty/department/${deptId}/reset`); setFaculty([]); toast.success(`All faculty records for ${deptCode} have been cleared.`); } 
         catch (err) { toast.error("Failed to reset system."); } 
       finally { setActionLocks(prev => ({ ...prev, resetSystem: false })); }
     }
  };

  const handleWhatsAppShare = (member) => {
    const rawMobile = String(member.mobile).trim();
    const phoneNumber = rawMobile.startsWith('91') ? rawMobile : `91${rawMobile}`;
    const message = encodeURIComponent(buildVoucherMessage(member));

    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleSendEmail = async (member) => {
    if (actionLocks.sendingEmailId) return; // Prevent multiple sends
    
    setActionLocks(prev => ({ ...prev, sendingEmailId: member._id }));
    try {
      const subject = "PICT EXAM PORTAL - CANTEEN VOUCHER";
      const message = buildEmailVoucherMessage(member);
      
      const response = await API.post('/mail/send-mail', {
        to: member.email,
        subject,
        message
      });
      
      if (response.data.success) {
        toast.success(`Email sent to ${member.fullName}!`);
      } else {
        toast.error("Failed to send email. Please try again.");
      }
    } catch (err) {
      console.error("Email send error:", err);
      toast.error(`Error: ${err.response?.data?.message || err.message}`);
    } finally {
      setActionLocks(prev => ({ ...prev, sendingEmailId: null }));
    }
  };

  const handleSendBulkEmail = async () => {
    if (actionLocks.sendingBulkEmail || filteredFaculty.length === 0) return;

    const isConfirmed = window.confirm(`Send voucher emails to ${filteredFaculty.length} faculty members now?`);
    if (!isConfirmed) return;
    
    setActionLocks(prev => ({ ...prev, sendingBulkEmail: true }));
    try {
      const recipients = filteredFaculty.map(f => ({
        email: f.email,
        message: buildEmailVoucherMessage(f)
      }));
      const subject = "PICT EXAM PORTAL - CANTEEN VOUCHER";
      
      const response = await API.post('/mail/send-bulk-mail', {
        recipients,
        subject
      });
      
      if (response.data.success) {
        toast.success(`✓ Bulk email sent! (${response.data.results.sent} sent, ${response.data.results.failed} failed)`);
      } else {
        toast.error("Failed to send bulk emails.");
      }
    } catch (err) {
      console.error("Bulk email error:", err);
      toast.error(`Error: ${err.response?.data?.message || err.message}`);
    } finally {
      setActionLocks(prev => ({ ...prev, sendingBulkEmail: false }));
    }
  };

  const handleAddSingle = async (e) => {
    e.preventDefault();
    if (actionLocks.addFaculty) return;
    if (!deptId || !deptCode) { toast.error("Authentication Error. Please re-login."); return; }
    setActionLocks(prev => ({ ...prev, addFaculty: true }));
    try {
      const smartSubject = formData.assignedSubject ? `${formData.validFrom}|${formData.validTill}|${formData.assignedSubject}` : '';
      await API.post('/faculty/add', { ...formData, assignedSubject: smartSubject, departmentId: deptId, deptCode: deptCode });
      setIsModalOpen(false);
      setFormData({ fullName: '', email: '', mobile: '', academicYear: isMTech ? '1st Yr (Regular)' : '2nd Yr (Regular)', assignedSubject: '', validFrom: new Date().toISOString().split('T')[0], validTill: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString().split('T')[0] });
      toast.success("Examiner added successfully!"); fetchFaculty();
    } catch (err) { toast.error("Failed to add faculty."); } 
    finally { setActionLocks(prev => ({ ...prev, addFaculty: false })); }
  };

  const handleAddGuest = async (e) => {
    e.preventDefault();
    if (actionLocks.addGuest) return;
    setActionLocks(prev => ({ ...prev, addGuest: true }));
    try {
        const res = await API.post('/guests/add', guestFormData);
        toast.success(`Success! Guest Code: ${res.data.voucher}`); 
        setIsGuestModalOpen(false);
        setGuestFormData({ guestName: '', facultyVoucher: '', validFrom: new Date().toISOString().split('T')[0], validTill: new Date().toISOString().split('T')[0] });
        fetchGuests();
    } catch (err) { toast.error(`Failed: ${err.response?.data?.error || err.message}`); } 
    finally { setActionLocks(prev => ({ ...prev, addGuest: false })); }
  };

const handleFileUpload = (e) => { 
    if (actionLocks.bulkUpload) return;
    const file = e.target.files[0];
    if (!file) return;

    setActionLocks(prev => ({ ...prev, bulkUpload: true }));
    const loadingToast = toast.loading("Excel parse ho raha hai...");

    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const bstr = evt.target.result;
            // 'read' use kar rahe hain direct
            const wb = read(bstr, { type: 'binary', cellDates: true });
            const sheetName = wb.SheetNames[0];
            const rawData = utils.sheet_to_json(wb.Sheets[sheetName]);

            const facultyMap = new Map();

            rawData.forEach(row => {
                const getVal = (searchKey) => {
                    const actualKey = Object.keys(row).find(k => k.trim().toLowerCase() === searchKey.toLowerCase());
                    return actualKey ? row[actualKey] : "";
                };

                const rawName = String(getVal('Internal Examiner')).trim(); 
                if (!rawName || rawName === "undefined") return; 

                // Name format fix: (ID)-Name
                const cleanedName = rawName.includes(')-') ? rawName.split(')-')[1].trim() : rawName;
                const mobile = String(getVal('Mobile No.')).trim();
                
                // Date formatting
                const fromDateStr = formatExcelDateSafely(getVal('From Date'));
                const tillDateStr = formatExcelDateSafely(getVal('End Date'));
                
                const patternName = String(getVal('Pattern Name') || "");
                const extractedYear = patternName.includes('(') ? patternName.split('(')[1].substring(0, 4) : (isMTech ? "1st Yr" : "2nd Yr");
                const finalYearScope = yearScope !== '' ? yearScope : extractedYear;

                const subjectName = String(getVal('Subject Name') || "").replace(/^\(.*?\)-\s*\d*\s*/, '').trim();
                const subjectType = getVal('Subject Type');
                const combinedSubject = subjectName && subjectType ? `${subjectName} (${subjectType})` : subjectName || subjectType;
                const smartSubject = combinedSubject ? `${fromDateStr}|${tillDateStr}|${combinedSubject}` : null;

                if (facultyMap.has(mobile)) {
                    const existing = facultyMap.get(mobile);
                    if (smartSubject && !existing.assignedSubjects.includes(smartSubject)) {
                        existing.assignedSubjects.push(smartSubject);
                    }
                } else {
                    facultyMap.set(mobile, { 
                        fullName: cleanedName, 
                        email: `${cleanedName.replace(/\s+/g, '.').toLowerCase()}@pict.edu`, 
                        mobile, 
                        academicYear: finalYearScope, 
                        departmentId: deptId, 
                        validFrom: fromDateStr, 
                        validTill: tillDateStr, 
                        assignedSubjects: smartSubject ? [smartSubject] : [] 
                    });
                }
            });

            const finalData = Array.from(facultyMap.values());
            
            // Backend call
            toast.loading(`Sending ${finalData.length} records to server...`, { id: loadingToast });
            const res = await API.post('/faculty/bulk-add', finalData);
            
            toast.success(`Success! ${res.data.added} added, ${res.data.extended} updated.`, { id: loadingToast });
            fetchFaculty(); 
            if(fileInputRef.current) fileInputRef.current.value = ""; 

        } catch (err) {
            console.error("Client Error:", err);
            toast.error("Processing mein error aaya. Console check kar.", { id: loadingToast });
        } finally {
            setActionLocks(prev => ({ ...prev, bulkUpload: false }));
        }
    };
    reader.readAsBinaryString(file);
};

  const filteredFaculty = faculty.filter(f => {
      const matchesSearch = f.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || f.voucherCode.toLowerCase().includes(searchTerm.toLowerCase()) || (f.email && f.email.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesYear = yearScope === '' || f.academicYear === yearScope;
      return matchesSearch && matchesYear;
  });

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#f8f9fc] relative font-sans h-screen overflow-hidden">
      {/* SIDEBAR */}
      <div className="w-64 bg-[#0a1128] text-white shadow-2xl z-10 shrink-0 hidden md:flex md:flex-col">
        <div className="p-6 border-b border-white/10">
          <h2 className="text-xl font-bold italic tracking-wider text-blue-400 mb-6">PICT EXAM PORTAL</h2>
          <div className="bg-white/5 p-3 rounded-xl border border-white/10 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-lg font-bold shadow-inner shrink-0">{userName.charAt(0).toUpperCase()}</div>
              <div className="overflow-hidden">
                  <p className="text-sm font-bold text-white truncate" title={userName}>{userName}</p>
                  <p className="text-[10px] font-medium text-blue-300 uppercase tracking-widest truncate">{deptName}</p>
              </div>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-2 mt-2">
          <button onClick={() => setActiveTab('faculty')} className={`w-full flex items-center gap-3 p-3 rounded-xl font-bold transition-all ${activeTab === 'faculty' ? 'bg-blue-600/20 text-blue-400 shadow-inner' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}><Users size={20} /> Faculty Management</button>
          <button onClick={() => setActiveTab('guests')}className={`w-full flex items-center gap-3 p-3 rounded-xl font-bold transition-all ${activeTab === 'guests' ? 'bg-blue-600/20 text-blue-400 shadow-inner' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}><Ticket size={20} /> Guest Vouchers</button>
          <button className="w-full flex items-center gap-3 p-3 rounded-xl font-bold text-gray-500 cursor-not-allowed opacity-50"><Calendar size={20} /> Exam Schedule</button>
          <button onClick={() => setActiveTab('reports')} className={`w-full flex items-center gap-3 p-3 rounded-xl font-bold transition-all ${activeTab === 'reports' ? 'bg-blue-600/20 text-blue-400 shadow-inner' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}><BarChart3 size={20} /> Reports & Logs</button>
        </nav>
        <button onClick={() => { sessionStorage.clear(); navigate('/'); }} className="p-6 text-gray-400 hover:text-white flex items-center gap-3 border-t border-white/10 transition-colors"><LogOut size={20} /> Logout</button>
      </div>

      {/* MOBILE */}
      <div className="md:hidden bg-[#0a1128] text-white p-4 flex justify-between items-center z-20 shrink-0 shadow-md">
         <div><h2 className="text-lg font-bold italic tracking-wider text-blue-400">PICT EXAM PORTAL</h2></div>
         <div className="flex gap-3 items-center">
             <select className="bg-white/10 text-white border border-white/20 rounded-md text-xs p-1.5 outline-none" value={activeTab} onChange={(e) => setActiveTab(e.target.value)}>
                 <option value="faculty" className="text-slate-800">Faculty</option><option value="guests" className="text-slate-800">Guests</option><option value="reports" className="text-slate-800">Reports</option>
             </select>
             <button onClick={() => { sessionStorage.clear(); navigate('/'); }} className="text-red-400"><LogOut size={18} /></button>
         </div>
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {activeTab === 'faculty' && (
          <>
            <header className="bg-white p-4 md:px-8 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm z-10 shrink-0">
              <h1 className="text-xl md:text-2xl font-bold text-gray-800">Faculty Overview</h1>
              <div className="flex gap-2 w-full sm:w-auto">
                <button disabled={actionLocks.exportFaculty} onClick={handleExportCSV} className="flex-1 sm:flex-none justify-center px-3 py-2 border-2 border-blue-100 rounded-lg text-xs md:text-sm font-bold flex items-center gap-1.5 text-blue-600 hover:bg-blue-50 disabled:opacity-60 disabled:cursor-not-allowed"><Download size={16} /> {actionLocks.exportFaculty ? 'Generating...' : 'CSV'}</button>
                <button disabled={actionLocks.resetSystem} onClick={handleResetSystem} className="flex-1 sm:flex-none justify-center px-3 py-2 border-2 border-red-100 bg-red-50 text-red-600 rounded-lg text-xs md:text-sm font-bold flex items-center gap-1.5 hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed"><RotateCcw size={16} /> {actionLocks.resetSystem ? 'Resetting...' : 'Reset'}</button>
              </div>
            </header>
            <main className="flex-1 flex flex-col p-4 md:p-8 gap-4 overflow-hidden">
               <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 shrink-0">
                <div className="col-span-2 lg:col-span-1 bg-white p-5 rounded-2xl border shadow-sm flex flex-row lg:flex-col justify-between items-center lg:items-start"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Examiners</p><h3 className="text-2xl md:text-3xl font-black text-gray-800">{totalExaminers}</h3></div>
                <div className="bg-white p-5 rounded-2xl border border-green-100 shadow-sm flex flex-col justify-center items-center lg:items-start"><p className="text-[10px] font-bold text-green-600 uppercase tracking-widest">Active</p><h3 className="text-2xl md:text-3xl font-black text-green-600">{activeVouchers}</h3></div>
                <div className="bg-white p-5 rounded-2xl border border-orange-100 shadow-sm flex flex-col justify-center items-center lg:items-start"><p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Pending</p><h3 className="text-2xl md:text-3xl font-black text-orange-500">{pendingExpired}</h3></div>
              </div>
              <div className="bg-white p-4 rounded-2xl border shadow-sm flex flex-col xl:flex-row gap-4 shrink-0 items-center">
                <div className="relative w-full xl:w-auto flex-1"><Search className="absolute left-4 top-3.5 text-gray-400" size={18} /><input type="text" placeholder="Search..." className="w-full pl-12 pr-4 py-2.5 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm" onChange={(e) => setSearchTerm(e.target.value)} /></div>
                <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
                  <select className="w-full sm:w-auto px-4 py-2.5 border-2 border-gray-100 rounded-xl text-gray-600 text-sm font-bold outline-none bg-white shadow-sm" value={yearScope} onChange={(e) => setYearScope(e.target.value)}>
                    <option value="">All Years</option>
                    {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleFileUpload} />
                    <button disabled={actionLocks.bulkUpload} onClick={() => fileInputRef.current.click()} className="flex-1 sm:flex-none justify-center px-4 py-2.5 border-2 border-yellow-100 rounded-xl text-sm font-bold flex items-center gap-2 text-yellow-700 bg-yellow-50 hover:bg-yellow-100 transition-all disabled:opacity-60 disabled:cursor-not-allowed"><FileSpreadsheet size={16} /> {actionLocks.bulkUpload ? 'Uploading...' : 'Upload'}</button>
                    <button disabled={actionLocks.sendingBulkEmail || filteredFaculty.length === 0} onClick={handleSendBulkEmail} className="flex-1 sm:flex-none justify-center px-4 py-2.5 border-2 border-purple-100 rounded-xl text-sm font-bold flex items-center gap-2 text-purple-700 bg-purple-50 hover:bg-purple-100 transition-all disabled:opacity-60 disabled:cursor-not-allowed"><Mail size={16} /> {actionLocks.sendingBulkEmail ? 'Sending...' : 'Email All'}</button>
                    <button className="flex-1 sm:flex-none justify-center px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg flex items-center gap-2 hover:bg-blue-700 active:scale-95 transition-all" onClick={() => setIsModalOpen(true)}><Plus size={18} /> New</button>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-2xl border shadow-sm flex-1 overflow-y-auto overflow-x-auto relative">
                <table className="w-full text-left border-collapse min-w-212.5">
                  <thead className="bg-white/95 backdrop-blur-sm border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase sticky top-0 z-10 shadow-sm">
                    <tr><th className="p-4 pl-6 md:pl-8">Faculty Details</th><th className="p-4">Assigned Subjects</th><th className="p-4 text-center">Year Scope</th><th className="p-4 text-center">Access Code</th><th className="p-4 text-center">Validity Period</th><th className="p-4 text-center pr-6 md:pr-8">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-sm">
                    {filteredFaculty.map((f) => {
                      // 🚀 NEW COORDINATOR FEATURE 1: Expiry Heatmap
                      const isExpired = new Date() > new Date(f.validTill);
                      const isExpiringToday = new Date().toDateString() === new Date(f.validTill).toDateString();
                      
                      return (
                      <tr key={f._id} className={`transition-all group ${isExpired ? 'opacity-60 bg-gray-50/30' : isExpiringToday ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-gray-50/50'}`}>
                        <td className="p-4 pl-6 md:pl-8 align-top">
                          <div className="flex items-center gap-2">
                             <p className="font-bold text-gray-800 text-sm">{f.fullName}</p>
                             {isExpiringToday && <AlertTriangle size={12} className="text-amber-500 animate-pulse" title="Expires Today!" />}
                          </div>
                          <p className="text-[11px] text-gray-400 font-medium">{f.email} • {f.mobile}</p>
                        </td>
                        <td className="p-4 align-top max-w-50">
                          {f.assignedSubjects && f.assignedSubjects.length > 0 ? (
                              <div className="flex flex-col gap-1.5 max-h-24 overflow-y-auto no-scrollbar">
                                  {f.assignedSubjects.map((sub, idx) => {
                                      const parts = sub.split('|');
                                      let dispText = parts.length === 3 ? `${parts[2]} (${new Date(parts[0]).toLocaleDateString('en-GB', {day: '2-digit', month: 'short'})})` : sub;
                                      return <span key={idx} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded border border-slate-200 leading-tight w-max max-w-full truncate">{dispText}</span>
                                  })}
                              </div>
                          ) : <span className="text-xs text-gray-400 italic">No Subjects</span>}
                        </td>
                        <td className="p-4 text-center align-top"><span className="bg-gray-100 text-gray-500 px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider">{f.academicYear}</span></td>
                        <td className="p-4 text-center align-top"><span className="font-mono font-bold text-blue-600 bg-blue-50/50 px-3 py-1 rounded-md text-[11px]">{f.voucherCode}</span></td>
                        <td className={`p-4 text-center text-[11px] font-semibold align-top ${isExpiringToday ? 'text-amber-600' : 'text-gray-500'}`}>
                          {new Date(f.validFrom).toLocaleDateString('en-GB')} — {new Date(f.validTill).toLocaleDateString('en-GB')}
                        </td>
                        <td className="p-4 pr-6 md:pr-8 text-center align-top"><div className="flex justify-center gap-2">
                            <button onClick={() => handleWhatsAppShare(f)} className="p-1.5 border border-green-200 rounded text-green-500 hover:bg-green-50"><MessageSquare size={16} /></button>
                            <button disabled={actionLocks.sendingEmailId === f._id} onClick={() => handleSendEmail(f)} className="p-1.5 border border-gray-200 rounded text-gray-400 hover:text-blue-600 disabled:opacity-60 disabled:cursor-not-allowed transition-all" title="Send Email"><Mail size={16} /> {actionLocks.sendingEmailId === f._id && <span className="animate-spin">⏳</span>}</button>
                            <button disabled={actionLocks.deletingFacultyId === f._id || !!actionLocks.deletingFacultyId} onClick={() => handleDelete(f._id)} className="p-1.5 border border-gray-200 rounded text-gray-400 hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"><Trash2 size={16} /></button>
                          </div></td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </main>
          </>
        )}

        {activeTab === 'guests' && (
          <main className="flex-1 p-8 h-full overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
               <h1 className="text-2xl font-bold text-gray-800">Guest Management</h1>
               <button onClick={() => setIsGuestModalOpen(true)} className="px-6 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-purple-700 shadow-lg"><Plus size={18} /> New Guest Pass</button>
            </div>
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    <tr><th className="p-4 pl-8">Guest Name</th><th className="p-4">Host</th><th className="p-4 text-center">Voucher</th><th className="p-4 text-center">Validity</th><th className="p-4 text-center">Status</th></tr>
                  </thead>
                  <tbody className="divide-y text-sm">
                    {guests.map(g => (
                      <tr key={g._id} className="hover:bg-gray-50">
                        <td className="p-4 pl-8 font-bold">{g.guestName}</td>
                        <td className="p-4 text-gray-500">{g.facultyId?.fullName}</td>
                        <td className="p-4 text-center font-mono font-bold text-purple-600">{g.voucherCode}</td>
                        <td className="p-4 text-center">{new Date(g.validTill).toLocaleDateString('en-GB')}</td>
                        <td className="p-4 text-center">{new Date() > new Date(g.validTill) ? <span className="text-red-500 font-bold">Expired</span> : <span className="text-green-500 font-bold">Active</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            </div>
          </main>
        )}

        {activeTab === 'reports' && (
          <>
          <header className="bg-white p-4 md:px-8 border-b flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 shadow-sm z-10 shrink-0">
              <h1 className="text-xl md:text-2xl font-bold text-gray-800">Canteen Usage Logs</h1>
              <div className="flex flex-col lg:flex-row gap-4 w-full xl:w-auto items-start lg:items-center">
                 <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 lg:pr-4 lg:border-r border-gray-200 w-full lg:w-auto">
                    <div className="flex items-center gap-2 w-full sm:w-auto"><span className="text-[10px] font-bold text-gray-400 uppercase">Year:</span>
                        <select className="text-xs p-2 border rounded-lg text-gray-600 outline-none font-bold bg-white" value={reportYearFilter} onChange={(e) => setReportYearFilter(e.target.value)}>
                            <option value="">All Years</option>
                            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto"><span className="text-[10px] font-bold text-gray-400 uppercase">From:</span><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="text-xs p-2 border rounded-lg text-gray-600" /></div>
                    <div className="flex items-center gap-2 w-full sm:w-auto"><span className="text-[10px] font-bold text-gray-400 uppercase">To:</span><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="text-xs p-2 border rounded-lg text-gray-600" /></div>
                 </div>
                 <div className="flex flex-row gap-2 w-full lg:w-auto">
                    <button disabled={actionLocks.exportOrders} onClick={handleExportReportsCSV} className="flex-1 lg:flex-none justify-center px-4 py-2 border-2 border-gray-100 rounded-lg text-xs font-bold flex items-center gap-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"><Download size={16} /> {actionLocks.exportOrders ? 'Generating...' : 'Excel'}</button>
                    <button disabled={actionLocks.exportPdf} onClick={generatePDFInvoice} className="flex-1 lg:flex-none justify-center px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-blue-700 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"><FileText size={16} /> {actionLocks.exportPdf ? 'Generating...' : 'PDF Bill'}</button>
                 </div>
              </div>
            </header>
            <main className="flex-1 flex flex-col p-4 md:p-8 gap-6 overflow-y-auto">
              {/* 🚀 NEW COORDINATOR FEATURE 2: Year-wise spending stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
                <div className="bg-white p-5 rounded-2xl border shadow-sm border-l-4 border-l-blue-500">
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Total Orders</p>
                  <h3 className="text-2xl font-black text-gray-800">{totalOrders}</h3>
                </div>
                <div className="bg-white p-5 rounded-2xl border shadow-sm border-l-4 border-l-green-500">
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Total Billed</p>
                  <h3 className="text-2xl font-black text-green-600">₹{totalSpent}</h3>
                </div>
                {/* 🚀 NEW Stats Card: Highest Year Expense */}
                <div className="bg-white p-5 rounded-2xl border shadow-sm overflow-hidden relative">
                   <div className="flex items-center gap-2 text-emerald-600 mb-1"><TrendingUp size={14} /><p className="text-[10px] font-bold uppercase">Budget Peak</p></div>
                   <h3 className="text-sm font-black text-slate-700 truncate">{yearWiseStats[0]?.year || 'N/A'}</h3>
                   <p className="text-[10px] text-slate-400 font-bold">Spent: ₹{yearWiseStats[0]?.total || 0}</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border shadow-sm flex-1 overflow-x-auto relative">
                <table className="w-full text-left border-collapse min-w-175">
                  <thead className="bg-gray-50 text-[10px] font-bold text-gray-400 uppercase sticky top-0 z-10 border-b">
                    <tr><th className="p-4 pl-8">Date & Time</th><th className="p-4">Billed To</th><th className="p-4 text-center">Year</th><th className="p-4 text-center">Voucher</th><th className="p-4 text-right pr-8">Total</th></tr>
                  </thead>
                  <tbody className="divide-y text-sm">
                    {reportOrders.length === 0 ? <tr><td colSpan="5" className="text-center p-12 text-gray-400">No logs found.</td></tr> :
                      reportOrders.map((order) => {
                        const isGuest = order.voucherCode?.startsWith('G-');
                        return (
                          <tr key={order._id} className="hover:bg-gray-50/50">
                            <td className="p-4 pl-8"><p className="font-bold">{new Date(order.orderDate || order.createdAt).toLocaleDateString('en-GB')}</p><p className="text-[10px] text-gray-400">{new Date(order.orderDate || order.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p></td>
                            <td className="p-4">{isGuest ? <div><p className="font-bold">{order.guestName}</p><p className="text-[10px] text-gray-500 italic">Host: {order.facultyId?.fullName}</p></div> : <p className="font-bold">{order.facultyId?.fullName}</p>}</td>
                            <td className="p-4 text-center text-xs font-semibold text-gray-400">{order.facultyId?.academicYear || 'N/A'}</td>
                            <td className="p-4 text-center"><span className="font-mono text-[11px] bg-gray-100 px-2 py-1 rounded">{order.voucherCode}</span></td>
                            <td className="p-4 text-right pr-8 font-black text-emerald-600">₹{order.totalAmount}</td>
                          </tr>
                        );
                      })
                    }
                  </tbody>
                </table>
              </div>
            </main>
          </>
        )}
      </div>

      {/* MODALS RENDERED BELOW */}
      {isModalOpen && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-slate-800">Add Examiner</h2><button onClick={() => setIsModalOpen(false)} className="text-slate-400 bg-slate-100 p-1.5 rounded-md"><X size={16}/></button></div>
            <form onSubmit={handleAddSingle} className="space-y-4">
              <input required type="text" placeholder="Full Name" value={formData.fullName} onChange={(e) => setFormData({...formData, fullName: e.target.value})} className="w-full p-3 border rounded-lg focus:border-blue-500 outline-none" />
              <input required type="email" placeholder="Email Address" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full p-3 border rounded-lg focus:border-blue-500 outline-none" />
              <input required type="text" placeholder="Mobile Number" value={formData.mobile} onChange={(e) => setFormData({...formData, mobile: e.target.value})} className="w-full p-3 border rounded-lg focus:border-blue-500 outline-none" />
              <input type="text" placeholder="Subject & Type" value={formData.assignedSubject} onChange={(e) => setFormData({...formData, assignedSubject: e.target.value})} className="w-full p-3 border rounded-lg focus:border-blue-500 outline-none" />
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">Year Scope</label>
                <select required value={formData.academicYear} onChange={(e) => setFormData({...formData, academicYear: e.target.value})} className="w-full p-3 border rounded-lg focus:border-blue-500 outline-none text-sm bg-white">
                  {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="flex gap-4">
                <div className="flex-1"><label className="block text-[10px] font-bold text-gray-400 mb-1">Valid From</label><input required type="date" value={formData.validFrom} onChange={(e) => setFormData({...formData, validFrom: e.target.value})} className="w-full p-2 border rounded-lg text-sm" /></div>
                <div className="flex-1"><label className="block text-[10px] font-bold text-gray-400 mb-1">Valid Till</label><input required type="date" value={formData.validTill} onChange={(e) => setFormData({...formData, validTill: e.target.value})} className="w-full p-2 border rounded-lg text-sm" /></div>
              </div>
              <button type="submit" disabled={actionLocks.addFaculty} className="w-full bg-blue-600 text-white font-bold p-3 rounded-lg mt-4 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed">{actionLocks.addFaculty ? 'Generating...' : 'Generate Voucher'}</button>
            </form>
          </div>
        </div>
      )}

      {isGuestModalOpen && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-slate-800">Issue Guest Pass</h2><button onClick={() => setIsGuestModalOpen(false)} className="text-slate-400 bg-slate-100 p-1.5 rounded-md"><X size={16}/></button></div>
            <form onSubmit={handleAddGuest} className="space-y-4">
              <input required type="text" placeholder="Guest Name" value={guestFormData.guestName} onChange={(e) => setGuestFormData({...guestFormData, guestName: e.target.value})} className="w-full p-3 border rounded-lg focus:border-purple-500 outline-none" />
              <input required type="text" placeholder="Host Voucher Code" value={guestFormData.facultyVoucher} onChange={(e) => setGuestFormData({...guestFormData, facultyVoucher: e.target.value})} className="w-full p-3 border rounded-lg focus:border-purple-500 outline-none" />
              <div className="flex gap-4">
                <div className="flex-1"><label className="block text-[10px] font-bold text-gray-400 mb-1">Valid From</label><input required type="date" value={guestFormData.validFrom} onChange={(e) => setGuestFormData({...guestFormData, validFrom: e.target.value})} className="w-full p-2 border rounded-lg text-sm" /></div>
                <div className="flex-1"><label className="block text-[10px] font-bold text-gray-400 mb-1">Valid Till</label><input required type="date" value={guestFormData.validTill} onChange={(e) => setGuestFormData({...guestFormData, validTill: e.target.value})} className="w-full p-2 border rounded-lg text-sm" /></div>
              </div>
              <button type="submit" disabled={actionLocks.addGuest} className="w-full bg-purple-600 text-white font-bold p-3 rounded-lg mt-4 hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed">{actionLocks.addGuest ? 'Issuing...' : 'Issue Guest Code'}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CoordinatorDashboard;