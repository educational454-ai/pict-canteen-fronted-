import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { Download, Printer, Plus, Edit, Trash2, LogOut, Utensils, CheckCircle2, XCircle, Power, PowerOff, Star, MessageSquare, PieChart, ChefHat, RefreshCw, Search, Check, X } from 'lucide-react'; 
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
  const [searchTerm, setSearchTerm] = useState(''); // 🚀 NEW: Search state
  const [isRefreshing, setIsRefreshing] = useState(false); 
  
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

    const autoRefreshInterval = setInterval(() => {
        refreshDataSilently();
    }, 10000); 

    return () => clearInterval(autoRefreshInterval); 
  }, []);

  useEffect(() => {
      sessionStorage.setItem('managerTab', activeTab);
  }, [activeTab]);

  const refreshDataSilently = async () => {
    try { 
        const res = await API.get('/orders/all'); 
        if (Array.isArray(res.data)) {
            setOrders(prevOrders => {
                if (res.data.length !== prevOrders.length) {
                    return res.data;
                }
                return prevOrders;
            });
        }
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

  const filteredOrders = orders.filter(order => {
      // 🚀 Search Logic
      const billedTo = (order.voucherCode?.startsWith('G-') ? order.guestName : order.facultyId?.fullName) || "Unknown";
      if (!billedTo.toLowerCase().includes(searchTerm.toLowerCase())) return false;

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

  // 🚀 ACTION: CANCEL ORDER (Delete from DB)
  const cancelOrder = async (orderId) => {
    if(window.confirm("Are you sure you want to cancel and PERMANENTLY delete this order? It will be removed from all reports.")) {
        try {
            await API.delete(`/orders/delete/${orderId}`);
            toast.success("Order Deleted Successfully");
            fetchOrders();
        } catch (err) {
            toast.error("Failed to cancel order.");
        }
    }
  };

  // 🚀 ACTION: COMPLETE ORDER (Update Status & Print)
  const completeOrder = async (order) => {
    try {
        await API.put(`/orders/${order._id}/status`, { status: 'Completed' });
        toast.success("Order Completed!");
        printReceipt(order); // Auto-open print
        fetchOrders();
    } catch (err) {
        toast.error("Failed to update status.");
    }
  };

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
      } catch (err) { toast.error(err.response?.data?.error || "Failed to save item."); }
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
          } catch (err) { toast.error("Failed to delete item."); }
      }
  };

  const toggleAvailability = async (item) => {
      try {
          await API.put(`/menu/update/${item._id}`, { ...item, isAvailable: !item.isAvailable });
          fetchMenuItems();
      } catch (err) { console.error("Failed to update availability"); }
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
        doc.setFontSize(16); doc.setFont("helvetica", "bold");
        doc.text("SCTR'S PUNE INSTITUTE OF COMPUTER TECHNOLOGY", 42, 18);
        doc.setFontSize(11); doc.setFont("helvetica", "normal");
        doc.text("Office of the Mess & Canteen Section", 42, 24);
        doc.rect(55, 30, 100, 8);
        doc.setFontSize(12); doc.setFont("helvetica", "bold");
        doc.text("DEPARTMENT-WISE BILLING REPORT", 62, 36);
        doc.setFontSize(10); doc.setFont("helvetica", "normal");
        
        const deptCodeName = filterDept !== 'All Departments' ? filterDept.replace("M.Tech ", "M").substring(0, 5).toUpperCase() : 'ALL';
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        doc.text(`Ref No: PICT/CNTN/${dateStr}/${deptCodeName}-01`, 14, 50);
        doc.text(`Date: ${startDate} to ${endDate}`, 140, 50);
        doc.setFont("helvetica", "bold");
        doc.text(`Department: ${filterDept.toUpperCase()}`, 14, 58);

        const facultyOrders = filteredOrders.filter(o => !o.voucherCode?.startsWith('G-'));
        const guestOrders = filteredOrders.filter(o => o.voucherCode?.startsWith('G-'));

        const facultyTotals = {};
        facultyOrders.forEach(order => {
            const rawDate = new Date(order.createdAt || order.orderDate).toLocaleDateString('en-GB');
            const baseName = order.facultyId?.fullName || 'Unknown Faculty';
            const groupingKey = `${baseName}_${rawDate}`; 
            if (!facultyTotals[groupingKey]) {
                facultyTotals[groupingKey] = { name: baseName, date: rawDate, items: [], total: 0 };
            }
            facultyTotals[groupingKey].total += order.totalAmount;
            facultyTotals[groupingKey].items.push(order.items.map(i => `${i.itemName}(x${i.quantity})`).join(', '));
        });

        const guestTotals = {};
        guestOrders.forEach(order => {
            const rawDate = new Date(order.createdAt || order.orderDate).toLocaleDateString('en-GB');
            const actualGuestName = order.guestName || 'Guest';
            const baseName = `${actualGuestName} (Host: ${order.facultyId?.fullName || 'Unknown'})`;
            const groupingKey = `${baseName}_${rawDate}`;
            if (!guestTotals[groupingKey]) {
                guestTotals[groupingKey] = { name: baseName, date: rawDate, items: [], total: 0 };
            }
            guestTotals[groupingKey].total += order.totalAmount;
            guestTotals[groupingKey].items.push(order.items.map(i => `${i.itemName}(x${i.quantity})`).join(', '));
        });

        let currentY = 70;
        doc.text("SECTION A: FACULTY CONSUMPTION", 14, currentY);
        const facultyData = Object.values(facultyTotals).map((d, i) => [i + 1, d.date, d.name, d.items.join(' | '), `Rs. ${d.total}`]);
        autoTable(doc, { startY: currentY + 3, head: [['Sr', 'Date', 'Faculty Name', 'Items', 'Total']], body: facultyData, theme: 'grid', bodyStyles: {fontStyle: 'bold'} });

        currentY = doc.lastAutoTable.finalY + 15;
        doc.text("SECTION B: GUEST CONSUMPTION", 14, currentY);
        const guestData = Object.values(guestTotals).map((d, i) => [i + 1, d.date, d.name, d.items.join(' | '), `Rs. ${d.total}`]);
        autoTable(doc, { startY: currentY + 3, head: [['Sr', 'Date', 'Guest Details', 'Items', 'Total']], body: guestData, theme: 'grid', bodyStyles: {fontStyle: 'bold'} });

        const sigY = doc.lastAutoTable.finalY + 30;
        doc.line(20, sigY, 60, sigY); doc.text("MESS MANAGER", 25, sigY + 6);
        doc.line(85, sigY, 135, sigY); doc.text("COORDINATOR", 95, sigY + 6);
        doc.line(160, sigY, 200, sigY); doc.text("PRINCIPAL", 172, sigY + 6);

        doc.save(`Canteen_Report_${filterDept.replace(/\s+/g, '_')}.pdf`);
      };
  };

  const printReceipt = (order) => {
      const doc = new jsPDF({ format: [80, 150] }); 
      doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text("PICT CANTEEN", 40, 10, { align: "center" });
      doc.setFontSize(8); doc.setFont("helvetica", "normal");
      doc.text("------------------------------------------", 40, 15, { align: "center" });
      doc.text(`Date: ${new Date().toLocaleString()}`, 10, 22);
      doc.text(`Billed To: ${order.facultyId?.fullName || order.guestName || 'Walk-in'}`, 10, 27);
      doc.text(`Dept: ${order.departmentId?.name || 'N/A'}`, 10, 32); 
      doc.text("------------------------------------------", 40, 38, { align: "center" });
      let y = 44;
      if(order.items) {
          order.items.forEach(item => {
              doc.text(`${item.itemName} x${item.quantity}`, 10, y);
              doc.text(`Rs.${item.price * item.quantity}`, 70, y, { align: "right" });
              y += 5;
          });
      }
      doc.text("------------------------------------------", 40, y + 2, { align: "center" });
      doc.setFontSize(10); doc.setFont("helvetica", "bold");
      doc.text(`TOTAL: Rs. ${order.totalAmount || 0}`, 10, y + 8);
      
      // 🚀 THE FIX: Automatically open print dialog
      const blob = doc.output('bloburl');
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = blob;
      document.body.appendChild(iframe);
      iframe.contentWindow.print();
  };

  return (
    <div className="min-h-screen bg-[#f8f9fc] font-sans text-slate-800">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm flex justify-between items-center px-6 py-4">
          <div className="flex items-center gap-3">
              <div className="bg-blue-600 text-white p-2.5 rounded-xl shadow-inner border border-blue-500"><Utensils size={22} /></div>
              <div>
                <h1 className="text-xl font-black text-slate-800 tracking-tight leading-tight">Canteen Manager</h1>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Kitchen Operations Dashboard</p>
              </div>
          </div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${isRefreshing ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
                {isRefreshing ? 'Syncing...' : 'Live'}
            </div>
            <button onClick={() => { sessionStorage.clear(); navigate('/'); }} className="flex items-center gap-2 text-slate-400 hover:text-red-600 font-bold transition-colors bg-slate-50 hover:bg-red-50 px-4 py-2 rounded-lg border border-slate-200 hover:border-red-200">
                <LogOut size={16} /> Logout
            </button>
          </div>
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
                                  <div key={name} className="bg-white px-4 py-2 rounded-xl border border-slate-200 flex items-center gap-3 shadow-sm hover:border-emerald-300 transition-all">
                                     <span className="w-6 h-6 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center text-[10px] font-black">{qty}</span>
                                     <span className="text-xs font-bold text-slate-700">{name}</span>
                                  </div>
                                ))}
                            </div>
                         </div>
                      </div>

                      <div className="flex flex-wrap items-end gap-5 mb-8 bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-inner">
                          {/* 🚀 NEW: Search Bar */}
                          <div className="flex-1 min-w-[200px] relative">
                             <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Search Name</label>
                             <div className="relative">
                                <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                                <input type="text" placeholder="Search faculty or guest..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 p-2.5 border-2 border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 bg-white transition-all shadow-sm" />
                             </div>
                          </div>
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Department</label>
                              <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className="p-3 border-2 border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 bg-white shadow-sm transition-all">
                                  <option value="All Departments">All Departments</option>
                                  {departments.map(d => <option key={d._id} value={d.name}>{d.name}</option>)}
                              </select>
                          </div>
                          <button onClick={downloadReport} className="bg-slate-800 hover:bg-black text-white px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-slate-200 transition-all active:scale-95">
                              <Download size={18} /> Export PDF
                          </button>
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
                                      <tr><td colSpan="6" className="text-center py-16 text-slate-400 font-bold bg-white">No orders found.</td></tr>
                                  ) : (
                                      filteredOrders.map(order => (
                                          <tr key={order._id} className="hover:bg-blue-50/50 transition-colors bg-white group">
                                              <td className="py-4 px-6">
                                                  <p className="font-bold text-slate-800">{order.voucherCode?.startsWith('G-') ? `${order.guestName} ` : (order.facultyId?.fullName || 'Walk-In')}</p>
                                                  {order.voucherCode?.startsWith('G-') && <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wider">Host: {order.facultyId?.fullName}</p>}
                                              </td>
                                              <td className="py-4 px-6"><span className="bg-slate-100 text-slate-600 font-bold px-3 py-1.5 rounded-md text-[10px] uppercase border border-slate-200 block w-max">{order.departmentId?.name || 'Unknown'}</span></td>
                                              <td className="py-4 px-6 text-slate-500 text-xs font-bold">{new Date(order.createdAt).toLocaleString('en-GB', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})}</td>
                                              <td className="py-4 px-6 text-slate-600 text-xs font-semibold leading-relaxed max-w-xs">{order.items?.map(i => `${i.itemName} (x${i.quantity})`).join(', ')}</td>
                                              <td className="py-4 px-6 font-black text-emerald-600 text-base">₹{order.totalAmount || 0}</td>
                                              <td className="py-4 px-6 text-right">
                                                  <div className="flex gap-2 justify-end">
                                                      {/* 🚀 Action Buttons */}
                                                      <button onClick={() => cancelOrder(order._id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Delete Order"><X size={20}/></button>
                                                      <button onClick={() => completeOrder(order)} className="p-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all shadow-md shadow-emerald-100" title="Complete & Print"><Check size={20}/></button>
                                                  </div>
                                              </td>
                                          </tr>
                                      ))
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>
              )}

              {activeTab === 'menu' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                      {menuItems.map(item => (
                          <div key={item._id} className={`border-2 p-5 rounded-2xl flex justify-between items-center transition-all bg-white group ${item.isAvailable !== false ? 'border-slate-100 hover:border-blue-300 hover:shadow-md' : 'border-red-100 bg-red-50/30 opacity-75'}`}>
                              <div>
                                  <span className="text-[9px] font-black text-blue-600 bg-blue-100 px-2 py-1 rounded uppercase tracking-widest">{item.category}</span>
                                  <h3 className={`font-black text-lg tracking-tight mt-1 ${item.isAvailable !== false ? 'text-slate-800' : 'text-slate-500 line-through'}`}>{item.itemName}</h3>
                                  <p className="font-black text-slate-500 mt-1">₹{item.price}</p>
                              </div>
                              <div className="flex flex-col gap-2 relative z-10">
                                  <button onClick={() => toggleAvailability(item)} className={`p-2.5 rounded-xl transition-all shadow-sm ${item.isAvailable !== false ? 'bg-white border border-slate-200 text-red-500 hover:bg-red-50' : 'bg-emerald-500 text-white shadow-emerald-200 hover:bg-emerald-600'}`}>{item.isAvailable !== false ? <PowerOff size={18}/> : <Power size={18}/>}</button>
                                  <div className="flex gap-2">
                                      <button onClick={() => editMenuItem(item)} className="p-2.5 bg-slate-50 border border-slate-200 text-slate-500 hover:text-blue-600 rounded-xl transition-colors"><Edit size={16}/></button>
                                      <button onClick={() => deleteMenuItem(item._id)} className="p-2.5 bg-slate-50 border border-slate-200 text-slate-500 hover:text-red-600 rounded-xl transition-colors"><Trash2 size={16}/></button>
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
              )}

              {activeTab === 'feedback' && (
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
              )}
          </div>
      </div>

       {isMenuModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
              <div className="bg-white p-8 rounded-3xl w-full max-w-sm shadow-2xl animate-in zoom-in duration-200 border border-slate-100">
                  <div className="flex justify-between items-center mb-6"><h2 className="text-2xl font-black text-slate-800 tracking-tight">{editingItemId ? 'Edit Item' : 'New Item'}</h2><div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><Utensils size={20}/></div></div>
                  <form onSubmit={handleMenuSubmit} className="space-y-5">
                      <input required type="text" placeholder="Item Name" value={menuForm.itemName} onChange={(e) => setMenuForm({...menuForm, itemName: e.target.value})} className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all" />
                      <select value={menuForm.category} onChange={(e) => setMenuForm({...menuForm, category: e.target.value})} className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all"><option value="Beverages">Beverages</option><option value="Snacks">Snacks</option><option value="Lunch">Lunch</option><option value="Dessert">Dessert</option></select>
                      <input required type="number" placeholder="Price" value={menuForm.price} onChange={(e) => setMenuForm({...menuForm, price: e.target.value})} className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all" />
                      <div className="flex gap-3 mt-8 pt-4 border-t border-slate-100"><button type="button" onClick={() => setIsMenuModalOpen(false)} className="flex-1 py-3.5 border-2 border-slate-200 font-bold text-slate-500 rounded-xl hover:bg-slate-50 transition-all">Cancel</button><button type="submit" className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-lg transition-all active:scale-95">Save</button></div>
                  </form>
              </div>
          </div>
      )}                      
    </div>
  );
};

export default CanteenManagerDashboard;