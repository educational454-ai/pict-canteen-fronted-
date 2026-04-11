import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { Download, Printer, Plus, Edit, Trash2, LogOut, Utensils, CheckCircle2, XCircle, Power, PowerOff, Star, MessageSquare, PieChart, ChefHat } from 'lucide-react'; 
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import toast from 'react-hot-toast'; 

const getLocalYYYYMMDD = (dateObj = new Date()) => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const categoryPriceLimits = {
    'Beverages': 30,
    'Snacks': 50,
    'Dessert': 50,
    'Lunch': 100
};

const CanteenManagerDashboard = () => {
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('managerTab') || 'orders'); 
  const [orders, setOrders] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [allFaculty, setAllFaculty] = useState([]);
  const [filterDept, setFilterDept] = useState('All Departments');
  
  const todayStr = getLocalYYYYMMDD();
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  
  const [isMenuModalOpen, setIsMenuModalOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [menuForm, setMenuForm] = useState({ itemName: '', category: 'Snacks', price: '' });

  useEffect(() => {
    fetchOrders();
    fetchDepartments();
    fetchMenuItems();
    fetchAllFaculty(); 
  }, []);

  useEffect(() => {
      sessionStorage.setItem('managerTab', activeTab);
  }, [activeTab]);

  const fetchOrders = async () => {
      try { 
          const res = await API.get('/orders/all'); 
          if (Array.isArray(res.data)) setOrders(res.data);
      } catch (err) { console.error("Error fetching orders:", err); }
  };

  const fetchDepartments = async () => {
      try { 
          const res = await API.get('/departments/all'); 
          if (Array.isArray(res.data)) setDepartments(res.data);
      } catch (err) { console.error("Error fetching depts"); }
  };

  const fetchMenuItems = async () => {
      try { 
          const res = await API.get('/menu/all'); 
          if (Array.isArray(res.data)) setMenuItems(res.data);
      } catch (err) { console.error("Error fetching menu"); }
  };

  const fetchAllFaculty = async () => {
      try {
          const res = await API.get('/faculty/all');
          if (Array.isArray(res.data)) setAllFaculty(res.data);
      } catch (err) { console.error("Error fetching faculty"); }
  };

  const filteredOrders = orders.filter(order => {
      if (order.createdAt || order.orderDate) {
          const rawDate = new Date(order.createdAt || order.orderDate);
          const localOrderDate = getLocalYYYYMMDD(rawDate);
          
          if (startDate && localOrderDate < startDate) return false;
          if (endDate && localOrderDate > endDate) return false;
      }

      if (filterDept !== 'All Departments') {
          const deptName = order.departmentId?.name || "Unknown";
          if (deptName !== filterDept) return false;
      }
      return true;
  });

  // 🚀 NEW ANALYTICS: Popular Dishes Logic
  const itemCounts = {};
  filteredOrders.forEach(o => {
    o.items.forEach(i => {
        itemCounts[i.itemName] = (itemCounts[i.itemName] || 0) + i.quantity;
    });
  });
  const popularItems = Object.entries(itemCounts).sort((a,b) => b[1] - a[1]).slice(0, 5);

  // 🚀 NEW ANALYTICS: Category Revenue Logic
  const categoryRevenue = {};
  filteredOrders.forEach(o => {
    o.items.forEach(i => {
        categoryRevenue[i.category] = (categoryRevenue[i.category] || 0) + (i.price * i.quantity);
    });
  });

  const feedbackOrders = orders.filter(o => o.rating);
  const averageRating = feedbackOrders.length > 0 
      ? (feedbackOrders.reduce((sum, o) => sum + o.rating, 0) / feedbackOrders.length).toFixed(1) 
      : 0;

  const handleMenuSubmit = async (e) => {
      e.preventDefault();

      const maxAllowedPrice = categoryPriceLimits[menuForm.category];
      if (maxAllowedPrice && Number(menuForm.price) > maxAllowedPrice) {
          toast.error(`Max price for ${menuForm.category} is ₹${maxAllowedPrice}.`);
          return; 
      }

      try {
          if (editingItemId) {
              await API.put(`/menu/update/${editingItemId}`, menuForm);
              toast.success("Item updated successfully!"); 
          } else {
              await API.post('/menu/add', menuForm);
              toast.success("New item added to menu!"); 
          }
          setIsMenuModalOpen(false);
          setMenuForm({ itemName: '', category: 'Snacks', price: '' });
          setEditingItemId(null);
          fetchMenuItems();
      } catch (err) { 
          toast.error(err.response?.data?.error || "Failed to save item."); 
      }
  };

  const editMenuItem = (item) => {
      setEditingItemId(item._id);
      setMenuForm({ itemName: item.itemName, category: item.category, price: item.price });
      setIsMenuModalOpen(true);
  };

  const deleteMenuItem = async (id) => {
      if(window.confirm("Are you sure you want to permanently delete this item?")) {
          try { 
              await API.delete(`/menu/delete/${id}`); 
              toast.success("Item deleted."); 
              fetchMenuItems(); 
          } catch (err) { 
              toast.error("Failed to delete item."); 
          }
      }
  };

  const toggleAvailability = async (item) => {
      try {
          await API.put(`/menu/update/${item._id}`, { ...item, isAvailable: !item.isAvailable });
          fetchMenuItems();
      } catch (err) {
          console.error("Failed to update availability");
      }
  };

const downloadReport = () => {
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
        
        const deptCodeName = filterDept !== 'All Departments' 
            ? filterDept.replace("M.Tech ", "M").substring(0, 5).toUpperCase() 
            : 'ALL';
            
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const refNo = `Ref No: PICT/CNTN/${dateStr}/${deptCodeName}-01`;
        const dateRangeText = `Date: ${startDate ? new Date(startDate).toLocaleDateString('en-GB') : 'All'} to ${endDate ? new Date(endDate).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB')}`;
        
        doc.text(refNo, 14, 50);
        doc.text(dateRangeText, 140, 50);
        doc.setFont("helvetica", "bold");
        
        const deptTitle = filterDept === 'All Departments' 
            ? "ALL DEPARTMENTS" 
            : `${filterDept.toUpperCase()}`;
        doc.text(`Department: ${deptTitle}`, 14, 58);

        const facultyOrders = filteredOrders.filter(o => !o.voucherCode?.startsWith('G-'));
        const guestOrders = filteredOrders.filter(o => o.voucherCode?.startsWith('G-'));

        const facultyTotals = {};
        facultyOrders.forEach(order => {
            const rawDateObj = new Date(order.createdAt || order.orderDate);
            const rawDate = rawDateObj.toLocaleDateString('en-GB');
            const orderDateIso = rawDateObj.toISOString().split('T')[0];
            const baseName = order.facultyId?.fullName || 'Unknown Faculty';
            const matchedFaculty = allFaculty.find(f => f.voucherCode === order.voucherCode || (order.facultyId && f._id === (order.facultyId._id || order.facultyId)));
            const yearScope = matchedFaculty?.academicYear || 'N/A';
            
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
                activeSubjects = relevantSubs.length > 0 ? relevantSubs.join(', ') : "Exams / Duties";
            }

            const groupingKey = `${baseName}_${rawDate}`; 
            if (!facultyTotals[groupingKey]) {
                facultyTotals[groupingKey] = { displayName: baseName, date: rawDate, yearAndSubs: `${yearScope}\n${activeSubjects}`, items: [], total: 0 };
            }
            facultyTotals[groupingKey].total += order.totalAmount;
            facultyTotals[groupingKey].items.push(order.items.map(i => `${i.itemName}(x${i.quantity})`).join(', '));
        });

        const guestTotals = {};
        guestOrders.forEach(order => {
            const rawDateObj = new Date(order.createdAt || order.orderDate);
            const rawDate = rawDateObj.toLocaleDateString('en-GB');
            const orderDateIso = rawDateObj.toISOString().split('T')[0];
            const actualGuestName = order.guestName || 'Guest';
            const baseName = `${actualGuestName} \n(Host: ${order.facultyId?.fullName || 'Unknown'})`;
            const hostFaculty = allFaculty.find(f => (order.facultyId && f._id === (order.facultyId._id || order.facultyId)));
            const yearScope = hostFaculty?.academicYear || 'N/A';
            
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
                activeSubjects = relevantSubs.length > 0 ? relevantSubs.join(', ') : "Exams / Duties";
            }

            const groupingKey = `${baseName}_${rawDate}`;
            if (!guestTotals[groupingKey]) {
                guestTotals[groupingKey] = { displayName: baseName, date: rawDate, yearAndSubs: `${yearScope}\n${activeSubjects}`, items: [], total: 0 };
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
          theme: 'grid', headStyles: { fillColor: [50, 50, 50] }, bodyStyles: { fillColor: false }, alternateRowStyles: { fillColor: false },
          styles: { fontSize: 8, cellPadding: 3 }, columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 1: { cellWidth: 20 }, 5: { halign: 'right', cellWidth: 20 } }
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
          theme: 'grid', headStyles: { fillColor: [50, 50, 50] }, bodyStyles: { fillColor: false }, alternateRowStyles: { fillColor: false },
          styles: { fontSize: 8, cellPadding: 3 }, columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 1: { cellWidth: 20 }, 5: { halign: 'right', cellWidth: 20 } }
        });

        currentY = doc.lastAutoTable.finalY;
        doc.text(`Sub-Total (Guest): Rs. ${guestSum}/-`, 140, currentY + 8);
        const grandTotal = facultySum + guestSum;
        doc.rect(130, currentY + 15, 66, 10); doc.setFontSize(12); doc.text(`GRAND TOTAL`, 135, currentY + 22); doc.text(`Rs. ${grandTotal}`, 175, currentY + 22);

        const pageHeight = doc.internal.pageSize.getHeight();
        let signatureY = currentY + 50; 
        if (signatureY + 30 > pageHeight - 20) { doc.addPage(); signatureY = 40; }
        doc.setFontSize(9); doc.line(20, signatureY, 60, signatureY); doc.text("MESS MANAGER", 25, signatureY + 6);
        doc.line(85, signatureY, 135, signatureY); doc.text("PRACTICAL COORDINATOR", 87, signatureY + 6);
        doc.line(160, signatureY, 200, signatureY); doc.text("HEAD OF DEPARTMENT", 162, signatureY + 6);
        doc.line(45, signatureY + 25, 85, signatureY + 25); doc.text("CEO", 60, signatureY + 31);
        doc.line(135, signatureY + 25, 175, signatureY + 25); doc.text("PRINCIPAL", 148, signatureY + 31);
        
        doc.setFontSize(7); const downloadTime = new Date().toLocaleString('en-GB');
        doc.text(`SYSTEM GENERATED REPORT | PICT CANTEEN | DOWNLOADED: ${downloadTime}`, 48, pageHeight - 5);
        doc.save(`Canteen_Report_${filterDept.replace(/\s+/g, '_')}_${startDate}.pdf`);
        toast.success("PDF Report Downloaded!"); 
      };
      img.onerror = () => { toast.error("Failed to load watermark image."); };
  };

  const printReceipt = (order) => {
      const doc = new jsPDF({ format: [80, 150] }); 
      doc.setFontSize(12); doc.text("PICT CANTEEN", 25, 10); doc.setFontSize(8);
      doc.text("--------------------------------", 10, 15);
      doc.text(`Date: ${new Date(order.createdAt || order.orderDate || Date.now()).toLocaleString()}`, 10, 20);
      doc.text(`Billed To: ${order.facultyId?.fullName || order.guestName || 'Walk-in'}`, 10, 25);
      doc.text(`Dept: ${order.departmentId?.name || 'N/A'}`, 10, 30); 
      doc.text("--------------------------------", 10, 35);
      let y = 40;
      if(order.items) {
          order.items.forEach(item => {
              doc.text(`${item.itemName} x${item.quantity}`, 10, y); doc.text(`Rs.${item.price * item.quantity}`, 60, y); y += 5;
          });
      }
      doc.text("--------------------------------", 10, y); doc.setFontSize(10); doc.text(`TOTAL: Rs. ${order.totalAmount || 0}`, 10, y + 6);
      doc.save(`Receipt_${order._id.substring(0,6)}.pdf`);
  };

  return (
    <div className="min-h-screen bg-[#f8f9fc] font-sans text-slate-800">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm flex justify-between items-center px-6 py-4">
          <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-2.5 rounded-xl shadow-inner border border-blue-500"><Utensils size={22} /></div>
              <div>
                <h1 className="text-xl font-black text-slate-800 tracking-tight leading-tight">Canteen Manager</h1>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Kitchen Operations Dashboard</p>
              </div>
          </div>
          <button onClick={() => { sessionStorage.clear(); navigate('/'); }} className="flex items-center gap-2 text-slate-400 hover:text-red-600 font-bold transition-colors bg-slate-50 hover:bg-red-50 px-4 py-2 rounded-lg border border-slate-200 hover:border-red-200">
              <LogOut size={16} /> Logout
          </button>
      </header>

      <div className="max-w-7xl mx-auto p-4 md:p-8">
          
          <div className="flex gap-2 border-b border-slate-200 mb-6 bg-white p-1.5 rounded-xl shadow-sm border inline-flex overflow-x-auto max-w-full">
              <button onClick={() => setActiveTab('orders')} className={`whitespace-nowrap px-6 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'orders' ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>Live Orders</button>
              <button onClick={() => setActiveTab('menu')} className={`whitespace-nowrap px-6 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'menu' ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>Menu Management</button>
              <button onClick={() => setActiveTab('feedback')} className={`whitespace-nowrap px-6 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'feedback' ? 'bg-orange-50 text-orange-700 shadow-sm border border-orange-100' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>Customer Feedback</button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 min-h-[600px]">
              
              {activeTab === 'orders' && (
                  <div className="animate-in fade-in duration-300">
                      
                      {/* 🚀 NEW ANALYTICS SECTION */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                         {/* Category Sales Card */}
                         <div className="bg-slate-50 p-5 rounded-2xl border flex flex-col gap-3 shadow-inner">
                            <div className="flex items-center gap-2 text-blue-600 mb-1"><PieChart size={18} /><h3 className="text-xs font-black uppercase tracking-widest">Category Sales</h3></div>
                            <div className="grid grid-cols-2 gap-2">
                               {Object.entries(categoryRevenue).map(([cat, rev]) => (
                                 <div key={cat} className="bg-white p-2 rounded-lg border text-center shadow-sm"><p className="text-[9px] font-bold text-slate-400 uppercase">{cat}</p><p className="text-sm font-black text-slate-700">₹{rev}</p></div>
                               ))}
                               {Object.keys(categoryRevenue).length === 0 && <div className="col-span-2 py-4 text-center text-xs text-slate-400 italic">No sales data yet</div>}
                            </div>
                         </div>
                         {/* Popular Items Card */}
                         <div className="bg-slate-50 p-5 rounded-2xl border flex flex-col gap-3 shadow-inner col-span-1 lg:col-span-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-emerald-600"><ChefHat size={18} /><h3 className="text-xs font-black uppercase tracking-widest">Top 5 Popular Dishes</h3></div>
                                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-black">Live Performance</span>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                {popularItems.map(([name, qty]) => (
                                  <div key={name} className="bg-white px-4 py-2 rounded-xl border border-slate-200 flex items-center gap-3 shadow-sm hover:border-emerald-300 transition-all">
                                     <span className="w-6 h-6 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center text-[10px] font-black">{qty}</span>
                                     <span className="text-xs font-bold text-slate-700">{name}</span>
                                  </div>
                                ))}
                                {popularItems.length === 0 && <p className="text-slate-400 text-xs italic">No orders in current date range.</p>}
                            </div>
                         </div>
                      </div>

                      <div className="flex flex-wrap items-end gap-5 mb-8 bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-inner">
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Department</label>
                              <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className="w-56 p-3 border-2 border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 bg-white shadow-sm transition-all">
                                  <option value="All Departments">All Departments</option>
                                  {departments.map(d => <option key={d._id} value={d.name}>{d.name}</option>)}
                              </select>
                          </div>
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">From Date</label>
                              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-44 p-3 border-2 border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 text-slate-700 bg-white shadow-sm transition-all" />
                          </div>
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">To Date</label>
                              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-44 p-3 border-2 border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 text-slate-700 bg-white shadow-sm transition-all" />
                          </div>
                          <button onClick={downloadReport} className="ml-auto bg-slate-800 hover:bg-black text-white px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-slate-200 transition-all active:scale-95">
                              <Download size={18} /> Download Official PDF
                          </button>
                      </div>

                      <div className="flex items-center justify-between mb-4 px-2">
                          <h2 className="text-xl font-black text-slate-800 tracking-tight">Orders in Range</h2>
                          <span className="bg-blue-100 text-blue-700 border border-blue-200 px-3 py-1 rounded-lg text-sm font-black shadow-inner">{filteredOrders.length}</span>
                      </div>

                      <div className="overflow-x-auto border-2 border-slate-100 rounded-2xl shadow-sm">
                          <table className="w-full text-left border-collapse">
                              <thead className="bg-slate-50 border-b-2 border-slate-100 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                                  <tr>
                                      <th className="py-5 px-6">Billed To</th>
                                      <th className="py-5 px-6">Department</th>
                                      <th className="py-5 px-6">Date</th>
                                      <th className="py-5 px-6">Items Ordered</th>
                                      <th className="py-5 px-6">Amount</th>
                                      <th className="py-5 px-6 text-right">Actions</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y-2 divide-slate-50 text-sm">
                                  {filteredOrders.length === 0 ? (
                                      <tr><td colSpan="6" className="text-center py-16 text-slate-400 font-bold bg-white">No orders found. Try clearing the dates!</td></tr>
                                  ) : (
                                      filteredOrders.map(order => {
                                          const orderDateDisplay = order.createdAt || order.orderDate ? new Date(order.createdAt || order.orderDate).toLocaleString('en-GB', {day: '2-digit', month: 'short', hour: '2-digit', minute:'2-digit'}) : 'No Date';
                                          const isGuest = order.voucherCode?.startsWith('G-');
                                          return (
                                              <tr key={order._id} className="hover:bg-blue-50/50 transition-colors bg-white group">
                                                  <td className="py-4 px-6">
                                                      <p className="font-bold text-slate-800">{isGuest ? `${order.guestName || 'Guest'} ` : (order.facultyId?.fullName || 'Walk-In')}</p>
                                                      {isGuest && <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wider">Host: {order.facultyId?.fullName}</p>}
                                                  </td>
                                                  <td className="py-4 px-6"><span className="bg-slate-100 text-slate-600 font-bold px-3 py-1.5 rounded-md text-[10px] uppercase tracking-widest border border-slate-200 block w-max">{order.departmentId?.name || 'Unknown'}</span></td>
                                                  <td className="py-4 px-6 text-slate-500 text-xs font-bold">{orderDateDisplay}</td>
                                                  <td className="py-4 px-6 text-slate-600 text-xs font-semibold leading-relaxed max-w-xs">{order.items?.map(i => `${i.itemName} (x${i.quantity})`).join(', ') || 'No Items'}</td>
                                                  <td className="py-4 px-6 font-black text-emerald-600 text-base">₹{order.totalAmount || 0}</td>
                                                  <td className="py-4 px-6 text-right"><button onClick={() => printReceipt(order)} className="bg-white border-2 border-slate-200 hover:border-blue-500 hover:text-blue-600 text-slate-500 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-2 ml-auto"><Printer size={16} /> Print KOT</button></td>
                                              </tr>
                                          )
                                      })
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>
              )}

              {activeTab === 'menu' && (
                  <div className="animate-in fade-in duration-300">
                      <div className="flex justify-between items-center mb-8 px-2">
                          <div>
                              <h2 className="text-xl font-black text-slate-800 tracking-tight">Menu Configuration</h2>
                              <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">Toggle items off if ingredients run out</p>
                          </div>
                          <button onClick={() => { setMenuForm({itemName:'', category:'Snacks', price:''}); setEditingItemId(null); setIsMenuModalOpen(true); }} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-200 active:scale-95 transition-all"><Plus size={18} /> Add New Item</button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                          {menuItems.map(item => {
                              const isAvailable = item.isAvailable !== false; 
                              return (
                              <div key={item._id} className={`border-2 p-5 rounded-2xl flex justify-between items-center transition-all bg-white relative overflow-hidden group ${isAvailable ? 'border-slate-100 hover:border-blue-300 hover:shadow-md' : 'border-red-100 bg-red-50/30 opacity-75'}`}>
                                  <div className="relative z-10">
                                      <div className="flex items-center gap-2 mb-2">
                                          <span className="text-[9px] font-black text-blue-600 bg-blue-100 px-2 py-1 rounded uppercase tracking-widest">{item.category}</span>
                                          {isAvailable ? 
                                              <span className="flex items-center gap-1 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded uppercase tracking-widest border border-emerald-100"><CheckCircle2 size={10}/> In Stock</span> : 
                                              <span className="flex items-center gap-1 text-[9px] font-black text-red-600 bg-red-50 px-2 py-1 rounded uppercase tracking-widest border border-red-100"><XCircle size={10}/> Out of Stock</span>
                                          }
                                      </div>
                                      <h3 className={`font-black text-lg tracking-tight ${isAvailable ? 'text-slate-800' : 'text-slate-500 line-through'}`}>{item.itemName}</h3>
                                      <p className="font-black text-slate-500 mt-1">₹{item.price}</p>
                                  </div>
                                  <div className="flex flex-col gap-2 relative z-10">
                                      <button onClick={() => toggleAvailability(item)} className={`p-2.5 rounded-xl transition-all shadow-sm ${isAvailable ? 'bg-white border border-slate-200 text-red-500 hover:bg-red-50 hover:border-red-200' : 'bg-emerald-500 text-white shadow-emerald-200 hover:bg-emerald-600'}`} title={isAvailable ? "Mark Out of Stock" : "Mark In Stock"}>{isAvailable ? <PowerOff size={18}/> : <Power size={18}/>}</button>
                                      <div className="flex gap-2">
                                          <button onClick={() => editMenuItem(item)} className="p-2.5 bg-slate-50 border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 rounded-xl transition-colors"><Edit size={16}/></button>
                                          <button onClick={() => deleteMenuItem(item._id)} className="p-2.5 bg-slate-50 border border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200 rounded-xl transition-colors"><Trash2 size={16}/></button>
                                      </div>
                                  </div>
                              </div>
                          )})}
                      </div>
                  </div>
              )}

              {activeTab === 'feedback' && (
                  <div className="animate-in fade-in duration-300">
                      <div className="flex items-center gap-6 mb-8 px-2 border-b border-slate-100 pb-6">
                          <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100 flex items-center gap-4">
                              <div className="bg-orange-500 text-white p-3 rounded-xl"><Star size={24} fill="currentColor"/></div>
                              <div>
                                  <p className="text-[10px] font-bold text-orange-600 uppercase tracking-widest">Average Rating</p>
                                  <h3 className="text-3xl font-black text-slate-800">{averageRating} <span className="text-sm text-slate-400">/ 5</span></h3>
                              </div>
                          </div>
                          <div>
                              <h2 className="text-xl font-black text-slate-800 tracking-tight">Customer Feedback Logs</h2>
                              <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">Based on {feedbackOrders.length} verified reviews.</p>
                          </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                          {feedbackOrders.length === 0 ? (
                              <div className="col-span-full py-16 text-center text-slate-400 font-medium border-2 border-dashed border-slate-200 rounded-2xl">No feedback has been submitted yet.</div>
                          ) : (
                              feedbackOrders.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).map(order => {
                                  const isGuest = order.voucherCode?.startsWith('G-');
                                  return (
                                  <div key={order._id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3">
                                      <div className="flex justify-between items-start">
                                          <div className="flex text-orange-400">
                                              {[...Array(5)].map((_, i) => <Star key={i} size={14} fill={i < order.rating ? "currentColor" : "none"} />)}
                                          </div>
                                          <span className="text-[10px] font-bold text-slate-400">{new Date(order.createdAt).toLocaleDateString('en-GB')}</span>
                                      </div>
                                      {order.feedbackText && (
                                          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                              <p className="text-sm font-medium text-slate-700 italic">"{order.feedbackText}"</p>
                                          </div>
                                      )}
                                      <div className="mt-auto pt-3 border-t border-slate-100">
                                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Ordered By</p>
                                          <p className="text-sm font-bold text-slate-800">
                                              {isGuest ? `${order.guestName || 'Guest'} ` : (order.facultyId?.fullName || 'Walk-In')}
                                          </p>
                                          {isGuest && <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Host: {order.facultyId?.fullName}</p>}
                                          <p className="text-xs text-slate-500 mt-2 line-clamp-1 border-t border-slate-50 pt-1">{order.items.map(i => i.itemName).join(', ')}</p>
                                      </div>
                                  </div>
                              )})
                          )}
                      </div>
                  </div>
              )}
          </div>
      </div>

       {isMenuModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
              <div className="bg-white p-8 rounded-3xl w-full max-w-sm shadow-2xl animate-in zoom-in duration-200 border border-slate-100">
                  <div className="flex justify-between items-center mb-6">
                      <h2 className="text-2xl font-black text-slate-800 tracking-tight">{editingItemId ? 'Edit Item' : 'New Menu Item'}</h2>
                      <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><Utensils size={20}/></div>
                  </div>
                  <form onSubmit={handleMenuSubmit} className="space-y-5">
                      <div>
                          <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">Item Name</label>
                          <input required type="text" placeholder="e.g. Masala Dosa" value={menuForm.itemName} onChange={(e) => setMenuForm({...menuForm, itemName: e.target.value})} className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all" />
                      </div>
                      <div>
                          <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">Category</label>
                          <select value={menuForm.category} onChange={(e) => setMenuForm({...menuForm, category: e.target.value})} className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all">
                              <option value="Beverages">Beverages</option>
                              <option value="Snacks">Snacks</option>
                              <option value="Lunch">Lunch</option>
                              <option value="Dessert">Dessert</option>
                          </select>
                      </div>
                      <div>
                          <div className="flex justify-between items-end mb-2">
                              <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest">Price (₹)</label>
                              <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded">
                                  Max: ₹{categoryPriceLimits[menuForm.category] || 'N/A'}
                              </span>
                          </div>
                          <input required type="number" placeholder="0" value={menuForm.price} onChange={(e) => setMenuForm({...menuForm, price: e.target.value})} className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all" />
                      </div>
                      <div className="flex gap-3 mt-8 pt-4 border-t border-slate-100">
                          <button type="button" onClick={() => setIsMenuModalOpen(false)} className="flex-1 py-3.5 border-2 border-slate-200 font-bold text-slate-500 rounded-xl hover:bg-slate-50 hover:text-slate-800 transition-all">Cancel</button>
                          <button type="submit" className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95">Save Menu Item</button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};

export default CanteenManagerDashboard;