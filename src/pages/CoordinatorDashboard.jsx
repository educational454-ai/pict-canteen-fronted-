import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, FileSpreadsheet, LogOut, Search, Download, Mail, Trash2, Plus, X, RotateCcw, BarChart3, Calendar, FileText, Ticket, MessageSquare, AlertTriangle, TrendingUp, RefreshCw } from 'lucide-react';
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  
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

  // Polling for new orders
  useEffect(() => {
    if (deptId) {
      fetchFaculty(); 
      fetchOrders(); 
      fetchGuests();
      const interval = setInterval(refreshOrdersSilently, 10000);
      return () => clearInterval(interval);
    }
  }, [deptId]);

  useEffect(() => { sessionStorage.setItem('activeCoordinatorTab', activeTab); }, [activeTab]);

  const refreshOrdersSilently = async () => {
    try {
      const res = await API.get(`/orders/department/${deptId}`);
      if (Array.isArray(res.data)) {
        setOrders(prev => res.data.length !== prev.length ? res.data : prev);
      }
    } catch (err) { console.error("Silent refresh failed"); }
  };

  const fetchFaculty = async () => { try { const res = await API.get(`/faculty/department/${deptId}`); setFaculty(res.data); } catch (err) { console.error("Error", err); } };
  const fetchGuests = async () => { try { const res = await API.get(`/guests/department/${deptId}`); setGuests(res.data); } catch (err) { console.error("Error fetching guests", err); } };
  const fetchOrders = async () => { 
    setIsRefreshing(true);
    try { const res = await API.get(`/orders/department/${deptId}`); setOrders(res.data); } 
    catch (err) { console.error("Error fetching orders", err); }
    finally { setIsRefreshing(false); }
  };

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

  const yearWiseStats = availableYears.map(year => {
    const total = filteredOrders.filter(o => o.facultyId?.academicYear === year).reduce((sum, o) => sum + o.totalAmount, 0);
    return { year, total };
  }).filter(s => s.total > 0).sort((a,b) => b.total - a.total);

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
      doc.setFontSize(16); doc.setFont("helvetica", "bold");
      doc.text("SCTR'S PUNE INSTITUTE OF COMPUTER TECHNOLOGY", 42, 18);
      doc.setFontSize(11); doc.setFont("helvetica", "normal");
      doc.text("Office of the Mess & Canteen Section", 42, 24);
      doc.rect(55, 30, 100, 8); doc.setFontSize(12); doc.setFont("helvetica", "bold");
      doc.text("DEPARTMENT-WISE BILLING REPORT", 62, 36);
      doc.setFontSize(10); doc.setFont("helvetica", "normal");
      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const refNo = `Ref No: PICT/CNTN/${dateStr}/${deptCode}-01`;
      const dateRangeText = `Date: ${startDate ? new Date(startDate).toLocaleDateString('en-GB') : 'All'} to ${endDate ? new Date(endDate).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB')}`;
      doc.text(refNo, 14, 50); doc.text(dateRangeText, 140, 50);
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
      doc.setFontSize(11); doc.setFont("helvetica", "bold");
      doc.text("SECTION A: FACULTY CONSUMPTION", 14, currentY);
      const facultyTableData = Object.values(facultyTotals).map((data, index) => [ index + 1, data.date, data.displayName, data.yearAndSubs, data.items.join(' | '), `Rs. ${data.total}` ]);
      const facultySum = Object.values(facultyTotals).reduce((sum, val) => sum + val.total, 0);
      autoTable(doc, {
        startY: currentY + 3,
        head: [['Sr', 'Date', 'Faculty Name', 'Year & Specific Subject', 'Items Consumed', 'Total (Rs)']], 
        body: facultyTableData.length ? facultyTableData : [['-', '-', 'No Faculty Orders', '-', '-', '-']],
        theme: 'grid', headStyles: { fillColor: [50, 50, 50] }, styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 5: { halign: 'right', cellWidth: 20 } }
      });
      currentY = doc.lastAutoTable.finalY; doc.text(`Sub-Total (Faculty): Rs. ${facultySum}/-`, 140, currentY + 8);
      currentY += 18; doc.text("SECTION B: GUEST/EXTERNAL CONSUMPTION", 14, currentY);
      const guestTableData = Object.values(guestTotals).map((data, index) => [ index + 1, data.date, data.displayName, data.yearAndSubs, data.items.join(' | '), `Rs. ${data.total}` ]);
      const guestSum = Object.values(guestTotals).reduce((sum, val) => sum + val.total, 0);
      autoTable(doc, {
        startY: currentY + 3,
        head: [['Sr', 'Date', 'Guest Details', 'Year & Specific Subject', 'Items Consumed', 'Total (Rs)']], 
        body: guestTableData.length ? guestTableData : [['-', '-', 'No Guest Orders', '-', '-', '-']],
        theme: 'grid', headStyles: { fillColor: [50, 50, 50] }, styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 5: { halign: 'right', cellWidth: 20 } }
      });
      currentY = doc.lastAutoTable.finalY; doc.text(`Sub-Total (Guest): Rs. ${guestSum}/-`, 140, currentY + 8);
      const grandTotal = facultySum + guestSum;
      doc.rect(130, currentY + 15, 66, 10); doc.setFontSize(12); doc.text(`GRAND TOTAL`, 135, currentY + 22); doc.text(`Rs. ${grandTotal}`, 175, currentY + 22);
      const pageHeight = doc.internal.pageSize.getHeight();
      let signatureY = currentY + 50; if (signatureY + 30 > pageHeight - 20) { doc.addPage(); signatureY = 40; }
      doc.setFontSize(9); doc.line(20, signatureY, 60, signatureY); doc.text("MESS MANAGER", 25, signatureY + 6);
      doc.line(85, signatureY, 135, signatureY); doc.text("PRACTICAL COORDINATOR", 87, signatureY + 6);
      doc.line(160, signatureY, 200, signatureY); doc.text("HEAD OF DEPARTMENT", 162, signatureY + 6);
      doc.line(45, signatureY + 25, 85, signatureY + 25); doc.text("CEO", 60, signatureY + 31);
      doc.line(135, signatureY + 25, 175, signatureY + 25); doc.text("PRINCIPAL", 148, signatureY + 31);
      doc.setFontSize(7); doc.text(`SYSTEM GENERATED REPORT | PICT CANTEEN | DOWNLOADED: ${new Date().toLocaleString('en-GB').toUpperCase()}`, 48, pageHeight - 5);
      doc.save(`${deptCode}_Billing_Report.pdf`); toast.success("PDF Downloaded!"); 
    };
    img.onerror = () => toast.error("Failed to load watermark image."); 
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to revoke this voucher and remove the examiner?")) {
      try { await API.delete(`/faculty/remove/${id}`); toast.success("Examiner deleted."); fetchFaculty(); } 
      catch (err) { toast.error("Failed to delete."); } 
    }
  };

  const handleResetSystem = async () => {
     if(window.confirm(`WARNING: This will deactivate ALL faculty records for ${deptCode}. Are you sure?`)) {
         try { await API.delete(`/faculty/department/${deptId}/reset`); setFaculty([]); toast.success(`System cleared.`); } 
         catch (err) { toast.error("Failed to reset system."); } 
     }
  };

  const handleWhatsAppShare = (member) => {
    const rawMobile = String(member.mobile).trim();
    const phoneNumber = rawMobile.startsWith('91') ? rawMobile : `91${rawMobile}`;
    const message = `*PICT EXAM PORTAL - CANTEEN VOUCHER*%0A%0ADear Prof. *${member.fullName}*,%0A%0AYou have been assigned as an examiner for the *${deptCode}* Department.%0A%0A*VOUCHER DETAILS:*%0A• *Access Code:* ${member.voucherCode}%0A• *Valid Until:* ${new Date(member.validTill).toLocaleDateString('en-GB')}%0A%0APlease present this code at the canteen counter.`;
    window.open(`https://wa.me/${phoneNumber}?text=${message}`, '_blank');
  };

  const handleSendEmail = (member) => {
    const subject = encodeURIComponent("Confidential: Your PICT Canteen Examination Voucher");
    const body = encodeURIComponent(`Dear Prof. ${member.fullName},\n\nYOUR SECURE ACCESS CODE: ${member.voucherCode}\nVALIDITY PERIOD ENDS: ${new Date(member.validTill).toLocaleDateString()}\n\nBest Regards,\n${deptCode} Department Coordinator`);
    window.location.href = `mailto:${member.email}?subject=${subject}&body=${body}`;
  };

  const handleAddSingle = async (e) => {
    e.preventDefault();
    if (!deptId || !deptCode) { toast.error("Session Error. Re-login."); return; }
    try {
      const smartSubject = formData.assignedSubject ? `${formData.validFrom}|${formData.validTill}|${formData.assignedSubject}` : '';
      await API.post('/faculty/add', { ...formData, assignedSubject: smartSubject, departmentId: deptId, deptCode: deptCode });
      setIsModalOpen(false);
      setFormData({ fullName: '', email: '', mobile: '', academicYear: isMTech ? '1st Yr (Regular)' : '2nd Yr (Regular)', assignedSubject: '', validFrom: new Date().toISOString().split('T')[0], validTill: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString().split('T')[0] });
      toast.success("Examiner added!"); fetchFaculty();
    } catch (err) { toast.error("Failed to add faculty."); } 
  };

  const handleAddGuest = async (e) => {
    e.preventDefault();
    try {
        const res = await API.post('/guests/add', guestFormData);
        toast.success(`Guest Code: ${res.data.voucher}`); setIsGuestModalOpen(false);
        setGuestFormData({ guestName: '', facultyVoucher: '', validFrom: new Date().toISOString().split('T')[0], validTill: new Date().toISOString().split('T')[0] });
        fetchGuests();
    } catch (err) { toast.error("Failed to issue guest pass."); } 
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
        const combinedSubject = `${subjectName} (${getVal('Subject Type') || ''})`;
        const smartSubject = `${fromDateStr}|${tillDateStr}|${combinedSubject}`;
        if (facultyMap.has(mobile)) {
          const existing = facultyMap.get(mobile);
          if (fromDateStr < existing.validFrom) existing.validFrom = fromDateStr;
          if (tillDateStr > existing.validTill) existing.validTill = tillDateStr;
          if (smartSubject && !existing.assignedSubjects.includes(smartSubject)) existing.assignedSubjects.push(smartSubject);
        } else {
          facultyMap.set(mobile, { fullName: cleanedName, email: `${cleanedName.replace(/\s+/g, '.').toLowerCase()}@pict.edu`, mobile, academicYear: finalYearScope, departmentId: deptId, validFrom: fromDateStr, validTill: tillDateStr, assignedSubjects: [smartSubject] });
        }
      });
      try {
        const res = await API.post('/faculty/bulk-add', Array.from(facultyMap.values()));
        toast.success("Upload Successful!"); fetchFaculty(); 
        if(fileInputRef.current) fileInputRef.current.value = ""; 
      } catch (err) { toast.error("Check file format."); }
    };
    reader.readAsBinaryString(file);
  };

  const filteredFaculty = faculty.filter(f => {
      const matchesSearch = f.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || f.voucherCode.toLowerCase().includes(searchTerm.toLowerCase()) || (f.email && f.email.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesYear = yearScope === '' || f.academicYear === yearScope;
      return matchesSearch && matchesYear;
  });

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#f8f9fc] relative h-screen overflow-hidden">
      <div className="w-64 bg-[#0a1128] text-white flex flex-col shadow-2xl z-10 hidden md:flex">
        <div className="p-6 border-b border-white/10">
          <h2 className="text-xl font-bold italic tracking-wider text-blue-400 mb-6">PICT EXAM PORTAL</h2>
          <div className="bg-white/5 p-3 rounded-xl border border-white/10 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold">{userName.charAt(0).toUpperCase()}</div>
              <div className="overflow-hidden">
                  <p className="text-sm font-bold truncate">{userName}</p>
                  <p className="text-[10px] text-blue-300 uppercase truncate">{deptName}</p>
              </div>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-2 mt-2">
          <button onClick={() => setActiveTab('faculty')} className={`w-full flex items-center gap-3 p-3 rounded-xl font-bold transition-all ${activeTab === 'faculty' ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-white'}`}><Users size={20} /> Faculty</button>
          <button onClick={() => setActiveTab('guests')} className={`w-full flex items-center gap-3 p-3 rounded-xl font-bold transition-all ${activeTab === 'guests' ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-white'}`}><Ticket size={20} /> Guests</button>
          <button onClick={() => setActiveTab('reports')} className={`w-full flex items-center gap-3 p-3 rounded-xl font-bold transition-all ${activeTab === 'reports' ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-white'}`}><BarChart3 size={20} /> Reports</button>
        </nav>
        <button onClick={() => { sessionStorage.clear(); navigate('/'); }} className="p-6 text-gray-400 hover:text-white flex items-center gap-3 border-t border-white/10"><LogOut size={20} /> Logout</button>
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {activeTab === 'faculty' && (
          <>
            <header className="bg-white p-4 md:px-8 border-b flex justify-between items-center shadow-sm shrink-0">
              <h1 className="text-xl md:text-2xl font-bold text-gray-800">Faculty Overview</h1>
              <div className="flex gap-2">
                <button onClick={handleExportCSV} className="px-3 py-2 border-2 border-blue-100 rounded-lg text-xs font-bold text-blue-600 hover:bg-blue-50 flex items-center gap-1.5"><Download size={16} /> CSV</button>
                <button onClick={handleResetSystem} className="px-3 py-2 border-2 border-red-100 text-red-600 rounded-lg text-xs font-bold hover:bg-red-50 flex items-center gap-1.5"><RotateCcw size={16} /> Reset</button>
              </div>
            </header>
            <main className="flex-1 flex flex-col p-4 md:p-8 gap-4 overflow-hidden">
               <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 shrink-0">
                <div className="bg-white p-5 rounded-2xl border shadow-sm"><p className="text-[10px] font-bold text-gray-400 uppercase">Examiners</p><h3 className="text-2xl font-black">{totalExaminers}</h3></div>
                <div className="bg-white p-5 rounded-2xl border border-green-100 shadow-sm"><p className="text-[10px] font-bold text-green-600 uppercase">Active</p><h3 className="text-2xl font-black text-green-600">{activeVouchers}</h3></div>
                <div className="bg-white p-5 rounded-2xl border border-orange-100 shadow-sm"><p className="text-[10px] font-bold text-orange-500 uppercase">Pending</p><h3 className="text-2xl font-black text-orange-500">{pendingExpired}</h3></div>
              </div>
              <div className="bg-white p-4 rounded-2xl border shadow-sm flex gap-4 shrink-0 items-center">
                <div className="relative flex-1"><Search className="absolute left-4 top-3.5 text-gray-400" size={18} /><input type="text" placeholder="Search..." className="w-full pl-12 pr-4 py-2.5 border-2 border-gray-100 rounded-xl text-sm" onChange={(e) => setSearchTerm(e.target.value)} /></div>
                <select className="px-4 py-2.5 border-2 border-gray-100 rounded-xl text-gray-600 text-sm font-bold bg-white" value={yearScope} onChange={(e) => setYearScope(e.target.value)}>
                    <option value="">All Years</option>{availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleFileUpload} />
                <button onClick={() => fileInputRef.current.click()} className="px-4 py-2.5 border-2 border-yellow-100 rounded-xl text-sm font-bold text-yellow-700 bg-yellow-50 flex items-center gap-2"><FileSpreadsheet size={16} /> Upload</button>
                <button className="px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg flex items-center gap-2" onClick={() => setIsModalOpen(true)}><Plus size={18} /> New</button>
              </div>
              <div className="bg-white rounded-2xl border shadow-sm flex-1 overflow-auto">
                <table className="w-full text-left">
                  <thead className="bg-white/95 border-b text-[10px] font-bold text-gray-400 uppercase sticky top-0 z-10 shadow-sm">
                    <tr><th className="p-4 pl-8">Faculty</th><th>Subjects</th><th className="text-center">Year</th><th className="text-center">Code</th><th className="text-center">Validity</th><th className="text-center pr-8">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y text-sm">
                    {filteredFaculty.map((f) => {
                      const isExpiring = new Date().toDateString() === new Date(f.validTill).toDateString();
                      return (
                      <tr key={f._id} className={`${isExpiring ? 'bg-amber-50/50' : 'hover:bg-gray-50/50'}`}>
                        <td className="p-4 pl-8 font-bold text-gray-800">{f.fullName}<p className="text-[10px] text-gray-400 font-medium">{f.mobile}</p></td>
                        <td className="p-4 max-w-[200px]">
                            {f.assignedSubjects.map((sub, i) => <span key={i} className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded mr-1 mb-1 inline-block border border-slate-200">{sub.split('|')[2] || sub}</span>)}
                        </td>
                        <td className="p-4 text-center font-bold text-gray-500">{f.academicYear}</td>
                        <td className="p-4 text-center font-mono font-bold text-blue-600">{f.voucherCode}</td>
                        <td className="p-4 text-center text-xs text-gray-500">{new Date(f.validTill).toLocaleDateString('en-GB')}</td>
                        <td className="p-4 pr-8 text-center"><div className="flex justify-center gap-2">
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

        {activeTab === 'reports' && (
          <main className="flex-1 flex flex-col p-4 md:p-8 gap-6 overflow-y-auto">
            <header className="flex justify-between items-center shrink-0">
               <h1 className="text-2xl font-bold">Usage Logs</h1>
               <div className="flex gap-4 items-center">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${isRefreshing ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                    <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
                    {isRefreshing ? 'Syncing...' : 'Live'}
                  </div>
                  <button onClick={generatePDFInvoice} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-lg"><FileText size={16} /> PDF Bill</button>
               </div>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 shrink-0">
              <div className="bg-white p-5 rounded-2xl border shadow-sm border-l-4 border-l-blue-500"><p className="text-[10px] font-bold text-gray-400 uppercase">Orders</p><h3 className="text-2xl font-black">{totalOrders}</h3></div>
              <div className="bg-white p-5 rounded-2xl border shadow-sm border-l-4 border-l-green-500"><p className="text-[10px] font-bold text-gray-400 uppercase">Total Spent</p><h3 className="text-2xl font-black text-green-600">₹{totalSpent}</h3></div>
              <div className="bg-white p-5 rounded-2xl border shadow-sm border-l-4 border-l-emerald-500"><p className="text-[10px] font-bold text-gray-400 uppercase">Budget Peak</p><h3 className="text-lg font-black text-slate-700">{yearWiseStats[0]?.year || 'N/A'}</h3></div>
            </div>
            <div className="bg-white rounded-2xl border shadow-sm flex-1 overflow-auto relative">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-[10px] font-bold text-gray-400 uppercase border-b sticky top-0">
                  <tr><th className="p-4 pl-8">Date</th><th>Billed To</th><th className="text-center">Year</th><th className="text-center">Voucher</th><th className="text-right pr-8">Total</th></tr>
                </thead>
                <tbody className="divide-y text-sm">
                  {filteredOrders.map((o) => (
                    <tr key={o._id} className="hover:bg-gray-50/50">
                      <td className="p-4 pl-8 font-bold">{new Date(o.orderDate || o.createdAt).toLocaleDateString('en-GB')}</td>
                      <td className="p-4 font-bold">{o.voucherCode?.startsWith('G-') ? o.guestName : o.facultyId?.fullName}</td>
                      <td className="p-4 text-center font-semibold text-gray-400">{o.facultyId?.academicYear || 'N/A'}</td>
                      <td className="p-4 text-center font-mono text-xs">{o.voucherCode}</td>
                      <td className="p-4 text-right pr-8 font-black text-emerald-600">₹{o.totalAmount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </main>
        )}
      </div>
      
      {/* RENDER MODALS (Faculty, Guest, etc.) HERE... */}
    </div>
  );
};

export default CoordinatorDashboard;