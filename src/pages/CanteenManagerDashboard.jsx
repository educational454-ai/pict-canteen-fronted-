import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { Download, Printer, Plus, Edit, Trash2, LogOut, Utensils, CheckCircle2, XCircle, Power, PowerOff, Star, MessageSquare, PieChart, ChefHat, RefreshCw, Search, Check, X, Loader2 } from 'lucide-react'; 
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import toast from 'react-hot-toast'; 
import { io } from 'socket.io-client';

const getLocalYYYYMMDD = (dateObj = new Date()) => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const categoryPriceLimits = {
    'Breakfast': 40,
    'Beverages': 30,
    'Quick Bites': 50,
    'Fasting Specials (Upvas)': 60,
    'Lunch': 100,
    'Dessert': 60
};

const getUniqueOrdersById = (orderList) => {
    const uniqueMap = new Map();
    orderList.forEach(order => {
        if (order?._id && !uniqueMap.has(order._id)) {
            uniqueMap.set(order._id, order);
        }
    });
    return Array.from(uniqueMap.values());
};

const getSocketBaseUrl = () => {
    const apiBase = API?.defaults?.baseURL || '';
    return apiBase.replace(/\/api\/?$/, '');
};

const buildOrderSearchText = (order) => {
    const billedTo = order.voucherCode?.startsWith('G-') ? order.guestName : order.facultyId?.fullName;
    const department = order.departmentId?.name || '';
    const voucherCode = order.voucherCode || '';
    const status = order.status || '';
    const amount = typeof order.totalAmount === 'number' ? String(order.totalAmount) : '';
    const rawDate = order.createdAt || order.orderDate;
    const orderDateText = rawDate ? new Date(rawDate).toLocaleString('en-GB') : '';
    const itemsText = Array.isArray(order.items)
        ? order.items
              .map((item) => `${item.itemName || ''} ${item.category || ''} ${item.quantity || ''}`)
              .join(' ')
        : '';

    return [billedTo, department, voucherCode, status, amount, orderDateText, itemsText]
        .join(' ')
        .toLowerCase();
};

const CanteenManagerDashboard = () => {
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('managerTab') || 'orders'); 
  const [orders, setOrders] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [allFaculty, setAllFaculty] = useState([]);
  const [filterDept, setFilterDept] = useState('All Departments');
  const [searchTerm, setSearchTerm] = useState(''); // 🚀 NEW: Search state
  const [isRefreshing, setIsRefreshing] = useState(false); 
  
  const todayStr = getLocalYYYYMMDD();
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  
  const [isMenuModalOpen, setIsMenuModalOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [menuForm, setMenuForm] = useState({ itemName: '', category: 'Breakfast', price: '' });
    const [actionLocks, setActionLocks] = useState({
            exportingPdf: false,
            processingOrderId: null,
            cancelingOrderId: null,
            reprintingOrderId: null,
            togglingItemId: null,
            deletingMenuItemId: null,
            savingMenu: false
    });

  useEffect(() => {
    fetchOrders();
    fetchDepartments();
    fetchMenuItems();
    fetchAllFaculty(); 

    const autoRefreshInterval = setInterval(() => {
        refreshDataSilently();
    }, 10000); 

    return () => clearInterval(autoRefreshInterval); 
  }, []);

    useEffect(() => {
        const socketBaseUrl = getSocketBaseUrl();
        if (!socketBaseUrl) return;

        const socket = io(socketBaseUrl, {
            transports: ['websocket', 'polling']
        });

        const syncOrders = () => {
            refreshDataSilently();
        };

        socket.on('order:placed', syncOrders);
        socket.on('order:updated', syncOrders);
        socket.on('order:deleted', syncOrders);

        return () => {
            socket.off('order:placed', syncOrders);
            socket.off('order:updated', syncOrders);
            socket.off('order:deleted', syncOrders);
            socket.disconnect();
        };
    }, []);

  useEffect(() => {
      sessionStorage.setItem('managerTab', activeTab);
  }, [activeTab]);

  const refreshDataSilently = async () => {
    try { 
        const res = await API.get('/orders/all'); 
        if (Array.isArray(res.data)) setOrders(res.data);
    } catch (err) { console.error("Auto-refresh failed"); }
  };

  const fetchOrders = async () => {
      setIsRefreshing(true);
      try { 
          const res = await API.get('/orders/all'); 
          if (Array.isArray(res.data)) setOrders(res.data);
      } catch (err) { console.error("Error fetching orders:", err); }
      finally { setIsRefreshing(false); }
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

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const filteredOrders = orders.filter(order => {
      // Search is intentionally broad so manager can match any order field (name, menu item, dept, voucher, etc.)
      if (normalizedSearchTerm) {
          const searchableText = buildOrderSearchText(order);
          if (!searchableText.includes(normalizedSearchTerm)) return false;
      }

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

    const liveOrders = filteredOrders.filter(order => order.status !== 'Completed');
    const processedOrders = filteredOrders.filter(order => order.status === 'Completed');
    const reportOrders = getUniqueOrdersById(processedOrders);

  const itemCounts = {};
  filteredOrders.forEach(o => {
    o.items.forEach(i => {
        itemCounts[i.itemName] = (itemCounts[i.itemName] || 0) + i.quantity;
    });
  });
  const popularItems = Object.entries(itemCounts).sort((a,b) => b[1] - a[1]).slice(0, 5);

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

  // 🚀 NEW: ACTION HANDLERS
  const cancelOrder = async (orderId) => {
        if (actionLocks.cancelingOrderId || actionLocks.processingOrderId) return;
    if (window.confirm("Are you sure you want to permanently delete/cancel this order? It will be removed from reports.")) {
                setActionLocks(prev => ({ ...prev, cancelingOrderId: orderId }));
        try {
            await API.delete(`/orders/delete/${orderId}`);
            toast.success("Order deleted successfully");
            fetchOrders();
        } catch (err) { toast.error("Failed to cancel order."); }
                finally { setActionLocks(prev => ({ ...prev, cancelingOrderId: null })); }
    }
  };

  const completeOrder = async (order) => {
        if (actionLocks.processingOrderId || actionLocks.cancelingOrderId) return;
        setActionLocks(prev => ({ ...prev, processingOrderId: order._id }));
    try {
        await API.put(`/orders/${order._id}/status`, { status: 'Completed' });
        toast.success("Order Completed!");
        printReceipt(order); // Auto-open print
        fetchOrders();
    } catch (err) { toast.error("Failed to update status."); }
        finally { setActionLocks(prev => ({ ...prev, processingOrderId: null })); }
  };

  const handleMenuSubmit = async (e) => {
      e.preventDefault();
      if (actionLocks.savingMenu) return;
      const maxAllowedPrice = categoryPriceLimits[menuForm.category];
      if (maxAllowedPrice && Number(menuForm.price) > maxAllowedPrice) {
          toast.error(`Max price for ${menuForm.category} is ₹${maxAllowedPrice}.`);
          return; 
      }
      setActionLocks(prev => ({ ...prev, savingMenu: true }));
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
      } catch (err) { toast.error(err.response?.data?.error || "Failed to save item."); }
      finally { setActionLocks(prev => ({ ...prev, savingMenu: false })); }
  };

  const editMenuItem = (item) => {
      setEditingItemId(item._id);
      setMenuForm({ itemName: item.itemName, category: item.category, price: item.price });
      setIsMenuModalOpen(true);
  };

  const deleteMenuItem = async (id) => {
      if (actionLocks.deletingMenuItemId || actionLocks.savingMenu) return;
      if(window.confirm("Are you sure you want to permanently delete this item?")) {
          setActionLocks(prev => ({ ...prev, deletingMenuItemId: id }));
          try { 
              await API.delete(`/menu/delete/${id}`); 
              toast.success("Item deleted."); 
              fetchMenuItems(); 
          } catch (err) { toast.error("Failed to delete item."); }
          finally { setActionLocks(prev => ({ ...prev, deletingMenuItemId: null })); }
      }
  };

  const toggleAvailability = async (item) => {
      if (actionLocks.togglingItemId || actionLocks.savingMenu) return;
      setActionLocks(prev => ({ ...prev, togglingItemId: item._id }));
      try {
          await API.put(`/menu/update/${item._id}`, { ...item, isAvailable: !item.isAvailable });
          fetchMenuItems();
      } catch (err) { console.error("Failed to update availability"); }
      finally { setActionLocks(prev => ({ ...prev, togglingItemId: null })); }
  };

  const downloadReport = () => {
      if (actionLocks.exportingPdf) return;
      setActionLocks(prev => ({ ...prev, exportingPdf: true }));
      const doc = new jsPDF();
      const img = new Image();
      img.src = '/image1.jpeg'; 
      
      img.onload = () => {
        // --- Watermark & Header ---
        doc.setGState(new doc.GState({ opacity: 0.15 }));
        doc.addImage(img, 'JPEG', 35, 70, 140, 140);
        doc.setGState(new doc.GState({ opacity: 1.0 })); 
        doc.addImage(img, 'JPEG', 14, 10, 22, 22);
        doc.setFontSize(16); doc.setFont("helvetica", "bold");
        doc.text("SCTR'S PUNE INSTITUTE OF COMPUTER TECHNOLOGY", 42, 18);
        doc.setFontSize(11); doc.setFont("helvetica", "normal");
        doc.text("Office of the Mess & Canteen Section", 42, 24);
        doc.rect(55, 30, 100, 8);
        doc.setFontSize(12); doc.setFont("helvetica", "bold");
        doc.text("DEPARTMENT-WISE BILLING REPORT", 62, 36);

        // --- Details ---
        doc.setFontSize(10); doc.setFont("helvetica", "normal");
        const deptCodeName = filterDept !== 'All Departments' ? filterDept.replace("M.Tech ", "M").substring(0, 5).toUpperCase() : 'ALL';
        const dateRef = new Date().toISOString().split('T')[0].replace(/-/g, '');
        doc.text(`Ref No: PICT/CNTN/${dateRef}/${deptCodeName}-01`, 14, 50);
        doc.text(`Date: ${startDate} to ${endDate}`, 140, 50);
        doc.setFont("helvetica", "bold");
        doc.text(`Department: ${filterDept.toUpperCase()}`, 14, 58);

        const facultyOrders = reportOrders.filter(o => !o.voucherCode?.startsWith('G-'));
        const guestOrders = reportOrders.filter(o => o.voucherCode?.startsWith('G-'));

        const processTotals = (orderArray) => {
            const totals = {};
            orderArray.forEach(order => {
                const rawDate = new Date(order.createdAt || order.orderDate).toLocaleDateString('en-GB');
                const orderDateIso = new Date(order.createdAt || order.orderDate).toISOString().split('T')[0];
                const baseName = order.voucherCode?.startsWith('G-') ? `${order.guestName} (Host: ${order.facultyId?.fullName})` : (order.facultyId?.fullName || 'Unknown');
                
                const matchedFaculty = allFaculty.find(f => (order.facultyId && f._id === (order.facultyId._id || order.facultyId)));
                const year = matchedFaculty?.academicYear || 'N/A';
                let sub = 'Duty/Other';
                if (matchedFaculty?.assignedSubjects) {
                    const m = matchedFaculty.assignedSubjects.find(s => { 
                        const p = s.split('|'); 
                        return p.length === 3 && orderDateIso >= p[0] && orderDateIso <= p[1]; 
                    });
                    if(m) sub = m.split('|')[2];
                }

                const key = `${baseName}_${rawDate}`;
                if (!totals[key]) totals[key] = { name: baseName, date: rawDate, details: `${year}\n${sub}`, items: [], total: 0 };
                totals[key].total += order.totalAmount;
                totals[key].items.push(order.items.map(i => `${i.itemName}(x${i.quantity})`).join(', '));
            });
            return Object.values(totals);
        };

        const facultyTotals = processTotals(facultyOrders);
        const guestTotals = processTotals(guestOrders);

        let currentY = 70;
        doc.setFontSize(11); doc.text("SECTION A: FACULTY CONSUMPTION", 14, currentY);
        const fBody = facultyTotals.map((d, i) => [i + 1, d.date, d.name, d.details, d.items.join(' | '), `Rs. ${d.total}`]);
        autoTable(doc, {
            startY: currentY + 3,
            head: [['Sr', 'Date', 'Faculty Name', 'Year & Subject', 'Items Consumed', 'Total (Rs)']],
            body: fBody.length ? fBody : [['-', '-', 'No Faculty Orders', '-', '-', '-']],
            theme: 'grid', headStyles: { fillColor: [50, 50, 50] }, bodyStyles: { fontStyle: 'bold', fontSize: 8.5 }
        });

        currentY = doc.lastAutoTable.finalY + 15;
        doc.text("SECTION B: GUEST/EXTERNAL CONSUMPTION", 14, currentY);
        const gBody = guestTotals.map((d, i) => [i + 1, d.date, d.name, d.details, d.items.join(' | '), `Rs. ${d.total}`]);
        autoTable(doc, {
            startY: currentY + 3,
            head: [['Sr', 'Date', 'Guest Details', 'Year & Subject', 'Items Consumed', 'Total (Rs)']],
            body: gBody.length ? gBody : [['-', '-', 'No Guest Orders', '-', '-', '-']],
            theme: 'grid', headStyles: { fillColor: [50, 50, 50] }, bodyStyles: { fontStyle: 'bold', fontSize: 8.5 }
        });

        const grand = facultyTotals.reduce((s,v)=>s+v.total,0) + guestTotals.reduce((s,v)=>s+v.total,0);
        currentY = doc.lastAutoTable.finalY + 10;
        doc.rect(130, currentY, 66, 10); doc.setFontSize(12); doc.text(`GRAND TOTAL: Rs. ${grand}`, 135, currentY + 7);

        let sigY = currentY + 40;
        if (sigY > 270) { doc.addPage(); sigY = 40; }
        doc.setFontSize(9);
        doc.line(20, sigY, 60, sigY); doc.text("MESS MANAGER", 25, sigY + 6);
        doc.line(85, sigY, 135, sigY); doc.text("COORDINATOR", 95, sigY + 6);
        doc.line(160, sigY, 200, sigY); doc.text("PRINCIPAL", 172, sigY + 6);
        doc.line(45, sigY + 25, 85, sigY + 25); doc.text("CEO", 60, sigY + 31);
        doc.line(135, sigY + 25, 175, sigY + 25); doc.text("PRINCIPAL", 148, sigY + 31);

        doc.save(`PICT_Report_${deptCodeName}.pdf`);
                setActionLocks(prev => ({ ...prev, exportingPdf: false }));
      };
            img.onerror = () => {
                toast.error("Failed to generate PDF report.");
                setActionLocks(prev => ({ ...prev, exportingPdf: false }));
            };
  };

    const handleReprint = (order) => {
            if (actionLocks.reprintingOrderId) return;
            setActionLocks(prev => ({ ...prev, reprintingOrderId: order._id }));
            printReceipt(order);
            setTimeout(() => {
                    setActionLocks(prev => ({ ...prev, reprintingOrderId: null }));
            }, 800);
    };

  const printReceipt = (order) => {
      const doc = new jsPDF({ format: [80, 150] }); 
      doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text("PICT CANTEEN", 40, 10, { align: "center" });
      doc.setFontSize(8); doc.text("------------------------------------------", 40, 15, { align: "center" });
      doc.text(`Date: ${new Date().toLocaleString()}`, 10, 22);
      doc.text(`Billed To: ${order.voucherCode?.startsWith('G-') ? order.guestName : order.facultyId?.fullName}`, 10, 27);
      doc.text("------------------------------------------", 40, 38, { align: "center" });
      let y = 44;
      order.items.forEach(i => {
          doc.text(`${i.itemName} x${i.quantity}`, 10, y);
          doc.text(`Rs.${i.price * i.quantity}`, 70, y, { align: "right" });
          y += 5;
      });
      doc.text("------------------------------------------", 40, y + 2, { align: "center" });
      doc.setFontSize(10); doc.text(`TOTAL: Rs. ${order.totalAmount}`, 10, y + 8);
      
      const blob = doc.output('bloburl');
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = blob;
      document.body.appendChild(iframe);
      iframe.contentWindow.print();
  };

  return (
    <div className="min-h-screen bg-[#f8f9fc] font-sans text-slate-800">
      <header className="bg-white border-b sticky top-0 z-20 shadow-sm flex justify-between items-center px-6 py-4">
          <div className="flex items-center gap-3">
              <div className="bg-blue-600 text-white p-2.5 rounded-xl shadow-lg"><Utensils size={22} /></div>
              <div><h1 className="text-xl font-black">Canteen Manager</h1><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Kitchen Operations</p></div>
          </div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase border transition-all ${isRefreshing ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-slate-50 text-slate-400'}`}>
                <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} /> {isRefreshing ? 'Syncing...' : 'Live'}
            </div>
            <button onClick={() => { sessionStorage.clear(); navigate('/'); }} className="flex items-center gap-2 text-slate-400 hover:text-red-600 font-bold transition-colors bg-slate-50 px-4 py-2 rounded-lg border hover:bg-red-50"><LogOut size={16} /> Logout</button>
          </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 md:p-8">
          <div className="gap-2 border-b mb-6 bg-white p-1.5 rounded-xl shadow-sm border inline-flex overflow-x-auto max-w-full">
              <button onClick={() => setActiveTab('orders')} className={`whitespace-nowrap px-6 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'orders' ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100' : 'text-slate-500 hover:text-slate-800'}`}>Live Orders</button>
              <button onClick={() => setActiveTab('menu')} className={`whitespace-nowrap px-6 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'menu' ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100' : 'text-slate-500 hover:text-slate-800'}`}>Menu Management</button>
              <button onClick={() => setActiveTab('feedback')} className={`whitespace-nowrap px-6 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'feedback' ? 'bg-orange-50 text-orange-700 shadow-sm border border-orange-100' : 'text-slate-500 hover:text-slate-800'}`}>Customer Feedback</button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border p-6 min-h-150">
              {activeTab === 'orders' && (
                  <div className="animate-in fade-in duration-300">
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                         <div className="bg-slate-50 p-5 rounded-2xl border flex flex-col gap-3 shadow-inner">
                            <div className="flex items-center gap-2 text-blue-600 mb-1"><PieChart size={18} /><h3 className="text-xs font-black uppercase tracking-widest">Category Sales</h3></div>
                            <div className="grid grid-cols-2 gap-2">
                               {Object.entries(categoryRevenue).map(([cat, rev]) => (
                                 <div key={cat} className="bg-white p-2 rounded-lg border text-center shadow-sm"><p className="text-[9px] font-bold text-slate-400 uppercase">{cat}</p><p className="text-sm font-black text-slate-700">₹{rev}</p></div>
                               ))}
                            </div>
                         </div>
                         <div className="bg-slate-50 p-5 rounded-2xl border flex flex-col gap-3 shadow-inner col-span-1 lg:col-span-2">
                            <div className="flex items-center gap-2 text-emerald-600"><ChefHat size={18} /><h3 className="text-xs font-black uppercase tracking-widest">Top 5 Popular Dishes</h3></div>
                            <div className="flex flex-wrap gap-3">
                                {popularItems.map(([name, qty]) => (
                                  <div key={name} className="bg-white px-4 py-2 rounded-xl border flex items-center gap-3 shadow-sm transition-all"><span className="w-6 h-6 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center text-[10px] font-black">{qty}</span><span className="text-xs font-bold text-slate-700">{name}</span></div>
                                ))}
                            </div>
                         </div>
                      </div>

                      <div className="flex flex-wrap items-end gap-4 mb-8 bg-slate-50 p-5 rounded-2xl border shadow-inner">
                          {/* 🚀 NEW: Search Bar Integration */}
                          <div className="flex-1 min-w-62.5 relative">
                                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Search Orders</label>
                             <div className="relative">
                                <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                                          <input type="text" placeholder="Search name, menu item, department, voucher, amount..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 p-2.5 border-2 border-slate-200 rounded-xl text-sm font-semibold focus:border-blue-500 outline-none transition-all shadow-sm" />
                             </div>
                          </div>
                          <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Department</label>
                          <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className="p-2.5 border-2 border-slate-200 rounded-xl text-sm font-semibold focus:border-blue-500 bg-white">
                              <option value="All Departments">All Departments</option>
                              {departments.map(d => <option key={d._id} value={d.name}>{d.name}</option>)}
                          </select></div>
                          <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">From</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="p-2.5 border-2 border-slate-200 rounded-xl text-sm font-semibold" /></div>
                          <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">To</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="p-2.5 border-2 border-slate-200 rounded-xl text-sm font-semibold" /></div>
                          <button disabled={actionLocks.exportingPdf} onClick={downloadReport} className="bg-slate-800 hover:bg-black text-white px-5 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-lg active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"><Download size={18} /> {actionLocks.exportingPdf ? 'Generating...' : 'Export PDF'}</button>
                      </div>

                      <div className="overflow-x-auto border-2 border-slate-100 rounded-2xl shadow-sm">
                          <table className="w-full text-left border-collapse">
                              <thead className="bg-slate-50 border-b-2 border-slate-100 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                                  <tr><th className="py-5 px-6">Billed To</th><th className="py-5 px-6">Department</th><th className="py-5 px-6">Date</th><th className="py-5 px-6">Items</th><th className="py-5 px-6">Amount</th><th className="py-5 px-6 text-right">Actions</th></tr>
                              </thead>
                              <tbody className="divide-y-2 divide-slate-50 text-sm font-medium">
                                  {liveOrders.length === 0 && (
                                      <tr>
                                        <td colSpan="6" className="py-10 px-6 text-center text-slate-400 font-semibold">No live orders in selected filters.</td>
                                      </tr>
                                  )}
                                  {liveOrders.map(order => (
                                          <tr key={order._id} className="hover:bg-blue-50/50 transition-colors bg-white">
                                              <td className="py-4 px-6">
                                                <p className="font-bold text-slate-800">{order.voucherCode?.startsWith('G-') ? order.guestName : order.facultyId?.fullName}</p>
                                              </td>
                                              <td className="py-4 px-6"><span className="bg-slate-100 text-slate-600 font-bold px-3 py-1.5 rounded-md text-[10px] border border-slate-200 uppercase">{order.departmentId?.name || 'Unknown'}</span></td>
                                              <td className="py-4 px-6 text-slate-500 text-xs">{new Date(order.createdAt).toLocaleString('en-GB', {day: '2-digit', month: 'short', hour: '2-digit', minute:'2-digit'})}</td>
                                              <td className="py-4 px-6 text-slate-600 text-xs">{order.items?.map(i => `${i.itemName} (x${i.quantity})`).join(', ')}</td>
                                              <td className="py-4 px-6 font-black text-emerald-600 text-base">₹{order.totalAmount}</td>
                                              <td className="py-4 px-6 text-right">
                                                  <div className="flex gap-2 justify-end">
                                                      {/* 🚀 FIXED ACTIONS: Cancel and Complete */}
                                                                                                            <button disabled={!!actionLocks.cancelingOrderId || !!actionLocks.processingOrderId} onClick={() => cancelOrder(order._id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed" title="Delete/Cancel Order">
                                                                                                                {actionLocks.cancelingOrderId === order._id ? <Loader2 size={20} className="animate-spin"/> : <X size={20}/>} 
                                                                                                            </button>
                                                                                                            <button disabled={!!actionLocks.processingOrderId || !!actionLocks.cancelingOrderId} onClick={() => completeOrder(order)} className="p-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all shadow-md shadow-emerald-100 disabled:opacity-60 disabled:cursor-not-allowed" title="Complete & Print">
                                                                                                                {actionLocks.processingOrderId === order._id ? <Loader2 size={20} className="animate-spin"/> : <Check size={20}/>} 
                                                                                                            </button>
                                                  </div>
                                              </td>
                                          </tr>
                                      ))
                                  }
                              </tbody>
                          </table>
                      </div>

                      <div className="mt-8">
                          <div className="flex items-center justify-between mb-3">
                              <h3 className="text-lg font-black text-slate-800">Processed Orders</h3>
                              <span className="text-xs font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full">
                                  {processedOrders.length} Processed
                              </span>
                          </div>
                          <div className="overflow-x-auto border-2 border-emerald-100 rounded-2xl shadow-sm">
                              <table className="w-full text-left border-collapse">
                                  <thead className="bg-emerald-50 border-b-2 border-emerald-100 text-[11px] font-black text-emerald-700 uppercase tracking-widest">
                                      <tr><th className="py-5 px-6">Billed To</th><th className="py-5 px-6">Department</th><th className="py-5 px-6">Date</th><th className="py-5 px-6">Items</th><th className="py-5 px-6">Amount</th><th className="py-5 px-6 text-right">Actions</th></tr>
                                  </thead>
                                  <tbody className="divide-y-2 divide-emerald-50 text-sm font-medium">
                                      {processedOrders.length === 0 && (
                                          <tr>
                                            <td colSpan="6" className="py-10 px-6 text-center text-slate-400 font-semibold">No processed orders yet.</td>
                                          </tr>
                                      )}
                                      {processedOrders.map(order => (
                                          <tr key={order._id} className="hover:bg-emerald-50/40 transition-colors bg-white">
                                              <td className="py-4 px-6">
                                                <p className="font-bold text-slate-800">{order.voucherCode?.startsWith('G-') ? order.guestName : order.facultyId?.fullName}</p>
                                                <span className="flex items-center gap-1 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded w-max mt-1 border border-emerald-100 uppercase tracking-tighter"><CheckCircle2 size={10}/> Order Complete</span>
                                              </td>
                                              <td className="py-4 px-6"><span className="bg-slate-100 text-slate-600 font-bold px-3 py-1.5 rounded-md text-[10px] border border-slate-200 uppercase">{order.departmentId?.name || 'Unknown'}</span></td>
                                              <td className="py-4 px-6 text-slate-500 text-xs">{new Date(order.createdAt).toLocaleString('en-GB', {day: '2-digit', month: 'short', hour: '2-digit', minute:'2-digit'})}</td>
                                              <td className="py-4 px-6 text-slate-600 text-xs">{order.items?.map(i => `${i.itemName} (x${i.quantity})`).join(', ')}</td>
                                              <td className="py-4 px-6 font-black text-emerald-600 text-base">₹{order.totalAmount}</td>
                                              <td className="py-4 px-6 text-right">
                                                                                                    <button disabled={!!actionLocks.reprintingOrderId} onClick={() => handleReprint(order)} className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-all disabled:opacity-60 disabled:cursor-not-allowed" title="Reprint Receipt">
                                                                                                        {actionLocks.reprintingOrderId === order._id ? <Loader2 size={20} className="animate-spin"/> : <Printer size={20}/>} 
                                                                                                    </button>
                                              </td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      </div>
                  </div>
              )}

              {activeTab === 'menu' && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 animate-in fade-in duration-300">
                    <div className="col-span-full flex justify-between mb-4 items-center">
                        <h2 className="text-xl font-black">Menu Items</h2>
                        <button onClick={() => { setMenuForm({itemName:'', category:'Snacks', price:''}); setEditingItemId(null); setIsMenuModalOpen(true); }} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg active:scale-95"><Plus size={18} /> Add New Item</button>
                    </div>
                    {menuItems.map(item => (
                        <div key={item._id} className={`border-2 p-5 rounded-2xl flex justify-between bg-white group transition-all ${item.isAvailable !== false ? 'hover:border-blue-200 shadow-sm' : 'opacity-60 bg-slate-50'}`}>
                            <div><span className="text-[9px] font-black text-blue-600 uppercase">{item.category}</span><h3 className="font-black text-lg">{item.itemName}</h3><p className="font-black text-slate-500">₹{item.price}</p></div>
                            <div className="flex flex-col gap-2">
                                <button disabled={!!actionLocks.togglingItemId || !!actionLocks.deletingMenuItemId || actionLocks.savingMenu} onClick={() => toggleAvailability(item)} className={`p-2 rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed ${item.isAvailable !== false ? 'border text-red-500 hover:bg-red-50' : 'bg-emerald-500 text-white hover:bg-emerald-600'}`}>{actionLocks.togglingItemId === item._id ? <Loader2 size={18} className="animate-spin"/> : (item.isAvailable !== false ? <PowerOff size={18}/> : <Power size={18}/>)}</button>
                                <button onClick={() => editMenuItem(item)} className="p-2 border rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50"><Edit size={18}/></button>
                                <button disabled={!!actionLocks.deletingMenuItemId || !!actionLocks.togglingItemId || actionLocks.savingMenu} onClick={() => deleteMenuItem(item._id)} className="p-2 border rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed">{actionLocks.deletingMenuItemId === item._id ? <Loader2 size={18} className="animate-spin"/> : <Trash2 size={18}/>}</button>
                            </div>
                        </div>
                    ))}
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
                        <h2 className="text-xl font-black text-slate-800 tracking-tight">Customer Feedback Logs</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {feedbackOrders.map(order => (
                            <div key={order._id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3">
                                <div className="flex justify-between items-start">
                                    <div className="flex text-orange-400">{[...Array(5)].map((_, i) => <Star key={i} size={14} fill={i < order.rating ? "currentColor" : "none"} />)}</div>
                                    <span className="text-[10px] font-bold text-slate-400">{new Date(order.createdAt).toLocaleDateString('en-GB')}</span>
                                </div>
                                {order.feedbackText && <div className="bg-slate-50 p-3 rounded-lg border border-slate-100"><p className="text-sm font-medium text-slate-700 italic">"{order.feedbackText}"</p></div>}
                                <div className="mt-auto pt-3 border-t border-slate-100">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Ordered By</p>
                                    <p className="text-sm font-bold text-slate-800">{order.voucherCode?.startsWith('G-') ? `${order.guestName} ` : (order.facultyId?.fullName || 'Walk-In')}</p>
                                    <p className="text-xs text-slate-500 mt-2 line-clamp-1 border-t border-slate-50 pt-1">{order.items.map(i => i.itemName).join(', ')}</p>
                                </div>
                            </div>
                        ))}
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
                      <input required type="text" placeholder="Item Name" value={menuForm.itemName} onChange={(e) => setMenuForm({...menuForm, itemName: e.target.value})} className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all" />
                      <select value={menuForm.category} onChange={(e) => setMenuForm({...menuForm, category: e.target.value})} className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all">
                          <option value="Beverages">Beverages</option><option value="Snacks">Snacks</option><option value="Lunch">Lunch</option><option value="Dessert">Dessert</option>
                      </select>
                      <input required type="number" placeholder="Price" value={menuForm.price} onChange={(e) => setMenuForm({...menuForm, price: e.target.value})} className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all" />
                      <div className="flex gap-3 mt-8 pt-4 border-t border-slate-100">
                          <button type="button" disabled={actionLocks.savingMenu} onClick={() => setIsMenuModalOpen(false)} className="flex-1 py-3.5 border-2 border-slate-200 font-bold text-slate-500 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-60 disabled:cursor-not-allowed">Cancel</button>
                          <button type="submit" disabled={actionLocks.savingMenu} className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed">{actionLocks.savingMenu ? 'Saving...' : 'Save Item'}</button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};

export default CanteenManagerDashboard;