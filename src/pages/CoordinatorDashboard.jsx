import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, FileSpreadsheet, LogOut, Search, Download, Mail, Trash2, Plus, X, RotateCcw, BarChart3, Calendar, FileText, Ticket, MessageSquare, AlertTriangle, TrendingUp, UserCheck } from 'lucide-react';
import * as XLSX from 'xlsx';
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

  const totalSpent = filteredOrders.reduce((sum, order) => sum + order.totalAmount, 0);
  const totalOrders = filteredOrders.length;

  // 🚀 NEW COORDINATOR ANALYTICS 1: Year-wise spending breakdown
  const yearWiseStats = availableYears.map(year => {
    const total = filteredOrders.filter(o => o.facultyId?.academicYear === year).reduce((sum, o) => sum + o.totalAmount, 0);
    return { year, total };
  }).filter(s => s.total > 0);

  // 🚀 NEW COORDINATOR ANALYTICS 2: Activity Insights
  const topExaminer = faculty.map(f => ({
    name: f.fullName,
    count: orders.filter(o => o.facultyId?._id === f._id).length
  })).sort((a,b) => b.count - a.count)[0];

  const handleExportCSV = () => {
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
  };

  const handleExportReportsCSV = () => {
    const exportData = filteredOrders.map(o => {
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
    XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
    XLSX.writeFile(workbook, `${deptCode}_Usage_${reportYearFilter || 'All_Years'}.xlsx`);
    toast.success("Orders CSV Downloaded!"); 
  };

  const generatePDFInvoice = () => {
    const doc = new jsPDF();
    const img = new Image();
    img.src = '/image1.jpeg'; 
    img.onload = () => {
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

      const facultyOrders = filteredOrders.filter(o => !o.voucherCode?.startsWith('G-'));
      const guestOrders = filteredOrders.filter(o => o.voucherCode?.startsWith('G-'));

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
    };
    img.onerror = () => toast.error("Failed to load watermark image."); 
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to revoke this voucher and remove the examiner?")) {
      try { await API.delete(`/faculty/remove/${id}`); toast.success("Examiner deleted and voucher revoked."); fetchFaculty(); } 
      catch (err) { toast.error("Failed to delete."); } 
    }
  };

  const handleResetSystem = async () => {
     if(window.confirm(`WARNING: This will deactivate ALL faculty records for ${deptCode}. Are you absolutely sure?`)) {
         try { await API.delete(`/faculty/department/${deptId}/reset`); setFaculty([]); toast.success(`All faculty records for ${deptCode} have been cleared.`); } 
         catch (err) { toast.error("Failed to reset system."); } 
     }
  };

  const handleWhatsAppShare = (member) => {
    const rawMobile = String(member.mobile).trim();
    const phoneNumber = rawMobile.startsWith('91') ? rawMobile : `91${rawMobile}`;
    
    const message = `*PICT EXAM PORTAL - CANTEEN VOUCHER*%0A%0A` +
                    `Dear Prof. *${member.fullName}*,%0A%0A` +
                    `You have been assigned as an examiner for the *${deptCode}* Department.%0A%0A` +
                    `*VOUCHER DETAILS:*%0A` +
                    `• *Access Code:* ${member.voucherCode}%0A` +
                    `• *Valid From:* ${new Date(member.validFrom).toLocaleDateString('en-GB')}%0A` +
                    `• *Valid Until:* ${new Date(member.validTill).toLocaleDateString('en-GB')}%0A%0A` +
                    `*PORTAL LINK:*%0A` +
                    `https://pict-canteen-fronted.vercel.app/%0A%0A` +
                    `_Please enter your access code at the portal link above to place orders._`;

    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleSendEmail = (member) => {
    const subject = encodeURIComponent("Confidential: Your PICT Canteen Examination Voucher");
    const body = encodeURIComponent(`Dear Prof. ${member.fullName},\n\nYOUR SECURE ACCESS CODE: ${member.voucherCode}\nVALIDITY PERIOD ENDS: ${new Date(member.validTill).toLocaleDateString()}\n\nBest Regards,\n${deptCode} Department Coordinator`);
    window.location.href = `mailto:${member.email}?subject=${subject}&body=${body}`;
  };

  const handleAddSingle = async (e) => {
    e.preventDefault();
    if (!deptId || !deptCode) { toast.error("Authentication Error. Please re-login."); return; }
    try {
      const smartSubject = formData.assignedSubject ? `${formData.validFrom}|${formData.validTill}|${formData.assignedSubject}` : '';
      await API.post('/faculty/add', { ...formData, assignedSubject: smartSubject, departmentId: deptId, deptCode: deptCode });
      setIsModalOpen(false);
      setFormData({ fullName: '', email: '', mobile: '', academicYear: isMTech ? '1st Yr (Regular)' : '2nd Yr (Regular)', assignedSubject: '', validFrom: new Date().toISOString().split('T')[0], validTill: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString().split('T')[0] });
      toast.success("Examiner added successfully!"); fetchFaculty();
    } catch (err) { toast.error("Failed to add faculty."); } 
  };

  const handleAddGuest = async (e) => {
    e.preventDefault();
    try {
        const res = await API.post('/guests/add', guestFormData);
        toast.success(`Success! Guest Code: ${res.data.voucher}`); 
        setIsGuestModalOpen(false);
        setGuestFormData({ guestName: '', facultyVoucher: '', validFrom: new Date().toISOString().split('T')[0], validTill: new Date().toISOString().split('T')[0] });
        fetchGuests();
    } catch (err) { toast.error(`Failed: ${err.response?.data?.error || err.message}`); } 
  };

  const handleFileUpload = (e) => { 
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
      const rawData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const facultyMap = new Map();
      rawData.forEach(row => {
        const getVal = (searchKey) => {
            const actualKey = Object.keys(row).find(k => k.trim().toLowerCase() === searchKey.toLowerCase());
            return actualKey ? row[actualKey] : "";
        };
        const rawName = getVal('Internal Examiner'); if (!rawName) return; 
        const cleanedName = rawName.includes('-') ? rawName.split('-')[1].trim() : rawName;
        const mobile = String(getVal('Mobile No.')).trim();
        const fromDateStr = formatExcelDateSafely(getVal('From Date'));
        const tillDateStr = formatExcelDateSafely(getVal('End Date'));
        const patternName = String(getVal('Pattern Name') || "");
        const extractedYear = patternName.includes('(') ? patternName.split('(')[1].substring(0, 4) : (isMTech ? "1st Yr" : "2nd Yr");
        const finalYearScope = yearScope !== '' ? yearScope : extractedYear;
        let subjectName = String(getVal('Subject Name') || "").replace(/^\(.*?\)-\s*\d*\s*/, '').trim();
        const subjectType = getVal('Subject Type');
        const combinedSubject = subjectName && subjectType ? `${subjectName} (${subjectType})` : subjectName || subjectType;
        const smartSubject = combinedSubject ? `${fromDateStr}|${tillDateStr}|${combinedSubject}` : null;
        if (facultyMap.has(mobile)) {
          const existing = facultyMap.get(mobile);
          if (fromDateStr < existing.validFrom) existing.validFrom = fromDateStr;
          if (tillDateStr > existing.validTill) existing.validTill = tillDateStr;
          existing.academicYear = finalYearScope; 
          if (smartSubject && !existing.assignedSubjects.includes(smartSubject)) existing.assignedSubjects.push(smartSubject);
        } else {
          facultyMap.set(mobile, { fullName: cleanedName, email: `${cleanedName.replace(/\s+/g, '.').toLowerCase()}@pict.edu`, mobile, academicYear: finalYearScope, departmentId: deptId, validFrom: fromDateStr, validTill: tillDateStr, assignedSubjects: smartSubject ? [smartSubject] : [] });
        }
      });
      try {
        const res = await API.post('/faculty/bulk-add', Array.from(facultyMap.values()));
        toast.success(`Success: ${res.data.added} added, ${res.data.extended} extended.`); fetchFaculty(); 
        if(fileInputRef.current) fileInputRef.current.value = ""; 
      } catch (err) { toast.error(`Upload Failed.`); }
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
      <div className="w-64 bg-[#0a1128] text-white flex flex-col shadow-2xl z-10 shrink-0 hidden md:flex">
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
                <button onClick={handleExportCSV} className="flex-1 sm:flex-none justify-center px-3 py-2 border-2 border-blue-100 rounded-lg text-xs md:text-sm font-bold flex items-center gap-1.5 text-blue-600 hover:bg-blue-50"><Download size={16} /> CSV</button>
                <button onClick={handleResetSystem} className="flex-1 sm:flex-none justify-center px-3 py-2 border-2 border-red-100 bg-red-50 text-red-600 rounded-lg text-xs md:text-sm font-bold flex items-center gap-1.5 hover:bg-red-100"><RotateCcw size={16} /> Reset</button>
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
                    <button onClick={() => fileInputRef.current.click()} className="flex-1 sm:flex-none justify-center px-4 py-2.5 border-2 border-yellow-100 rounded-xl text-sm font-bold flex items-center gap-2 text-yellow-700 bg-yellow-50 hover:bg-yellow-100 transition-all"><FileSpreadsheet size={16} /> Upload</button>
                    <button className="flex-1 sm:flex-none justify-center px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg flex items-center gap-2 hover:bg-blue-700 active:scale-95 transition-all" onClick={() => setIsModalOpen(true)}><Plus size={18} /> New</button>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-2xl border shadow-sm flex-1 overflow-y-auto overflow-x-auto relative">
                <table className="w-full text-left border-collapse min-w-[850px]">
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
                        <td className="p-4 align-top max-w-[200px]">
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
                            <button onClick={() => handleSendEmail(f)} className="p-1.5 border border-gray-200 rounded text-gray-400 hover:text-blue-600"><Mail size={16} /></button>
                            <button onClick={() => handleDelete(f._id)} className="p-1.5 border border-gray-200 rounded text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
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
          <main className="flex-1 flex flex-col p-8 gap-6 overflow-y-auto">
            <header className="flex justify-between items-center">
               <h1 className="text-2xl font-bold text-gray-800">Canteen Usage Logs</h1>
               <div className="flex gap-4 items-center">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase border ${isRefreshing ? 'bg-blue-50 text-blue-600' : 'text-slate-400'}`}>
                    <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} /> {isRefreshing ? 'Syncing...' : 'Live'}
                  </div>
                  <button onClick={generatePDFInvoice} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-lg hover:bg-blue-700 transition-all"><FileText size={16} /> PDF Bill</button>
               </div>
            </header>
            <div className="grid grid-cols-3 gap-4 shrink-0">
              <div className="bg-white p-5 rounded-2xl border shadow-sm border-l-4 border-l-blue-500"><p className="text-[10px] font-bold text-gray-400 uppercase">Orders</p><h3 className="text-2xl font-black">{totalOrders}</h3></div>
              <div className="bg-white p-5 rounded-2xl border shadow-sm border-l-4 border-l-green-500"><p className="text-[10px] font-bold text-gray-400 uppercase">Total Spent</p><h3 className="text-2xl font-black text-green-600">₹{totalSpent}</h3></div>
              <div className="bg-white p-5 rounded-2xl border shadow-sm border-l-4 border-l-emerald-500"><p className="text-[10px] font-bold text-gray-400 uppercase">Budget Peak</p><h3 className="text-sm font-black text-slate-700">{yearWiseStats[0]?.year || 'N/A'}</h3></div>
            </div>
            <div className="bg-white rounded-2xl border shadow-sm flex-1 overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 text-[10px] font-bold text-gray-400 uppercase border-b sticky top-0 z-10">
                  <tr>
                    <th className="p-4 pl-8">Date</th>
                    <th className="p-4">Billed To</th>
                    <th className="p-4">Assigned Subject</th>
                    <th className="p-4 text-center">Year</th>
                    <th className="p-4 text-center">Voucher</th>
                    <th className="p-4 text-right pr-8">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-sm">
                  {filteredOrders.map((o) => {
                    const orderDateIso = new Date(o.orderDate || o.createdAt).toISOString().split('T')[0];
                    let displaySubject = "Duty/Other";
                    if (o.facultyId?.assignedSubjects) {
                        const matchingSub = o.facultyId.assignedSubjects.find(sub => {
                            const parts = sub.split('|');
                            return parts.length === 3 && orderDateIso >= parts[0] && orderDateIso <= parts[1];
                        });
                        if(matchingSub) displaySubject = matchingSub.split('|')[2];
                    }
                    return (
                      <tr key={o._id} className="hover:bg-gray-50/50">
                        <td className="p-4 pl-8 font-bold text-gray-700">{new Date(o.orderDate || o.createdAt).toLocaleDateString('en-GB')}</td>
                        <td className="p-4 font-bold">{o.voucherCode?.startsWith('G-') ? o.guestName : o.facultyId?.fullName}</td>
                        <td className="p-4"><span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-1 rounded font-bold border border-blue-100 block w-max max-w-[200px] truncate">{displaySubject}</span></td>
                        <td className="p-4 text-center font-semibold text-gray-500">{o.facultyId?.academicYear || 'N/A'}</td>
                        <td className="p-4 text-center font-mono text-[11px] text-gray-400">{o.voucherCode}</td>
                        <td className="p-4 text-right pr-8 font-black text-emerald-600">₹{o.totalAmount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </main>
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
              <button type="submit" className="w-full bg-blue-600 text-white font-bold p-3 rounded-lg mt-4 hover:bg-blue-700">Generate Voucher</button>
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
              <button type="submit" className="w-full bg-purple-600 text-white font-bold p-3 rounded-lg mt-4 hover:bg-purple-700">Issue Guest Code</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CoordinatorDashboard;