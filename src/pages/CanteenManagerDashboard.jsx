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

const categoryPriceLimits = { 'Beverages': 30, 'Snacks': 50, 'Dessert': 50, 'Lunch': 100 };

const CanteenManagerDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('managerTab') || 'orders'); 
  const [orders, setOrders] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [allFaculty, setAllFaculty] = useState([]);
  const [filterDept, setFilterDept] = useState('All Departments');
  const [searchTerm, setSearchTerm] = useState(''); 
  const [isRefreshing, setIsRefreshing] = useState(false);

  const todayStr = getLocalYYYYMMDD();
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  
  const [isMenuModalOpen, setIsMenuModalOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [menuForm, setMenuForm] = useState({ itemName: '', category: 'Snacks', price: '' });

  useEffect(() => {
    fetchOrders(); fetchDepartments(); fetchMenuItems(); fetchAllFaculty(); 
    const autoRefreshInterval = setInterval(() => { refreshDataSilently(); }, 10000); 
    return () => clearInterval(autoRefreshInterval); 
  }, []);

  useEffect(() => { sessionStorage.setItem('managerTab', activeTab); }, [activeTab]);

  const refreshDataSilently = async () => {
    try { 
        const res = await API.get('/orders/all'); 
        if (Array.isArray(res.data)) setOrders(res.data);
    } catch (err) { console.error("Silent sync failed"); }
  };

  const fetchOrders = async () => {
      setIsRefreshing(true);
      try { 
          const res = await API.get('/orders/all'); 
          if (Array.isArray(res.data)) setOrders(res.data);
      } catch (err) { console.error("Error fetching orders:", err); }
      finally { setIsRefreshing(false); }
  };

  const fetchDepartments = async () => { try { const res = await API.get('/departments/all'); setDepartments(res.data); } catch (err) {} };
  const fetchMenuItems = async () => { try { const res = await API.get('/menu/all'); setMenuItems(res.data); } catch (err) {} };
  const fetchAllFaculty = async () => { try { const res = await API.get('/faculty/all'); setAllFaculty(res.data); } catch (err) {} };

  const filteredOrders = orders.filter(order => {
      const name = (order.voucherCode?.startsWith('G-') ? order.guestName : order.facultyId?.fullName) || "";
      if (!name.toLowerCase().includes(searchTerm.toLowerCase())) return false; 

      if (order.createdAt || order.orderDate) {
          const localOrderDate = getLocalYYYYMMDD(new Date(order.createdAt || order.orderDate));
          if (startDate && localOrderDate < startDate) return false;
          if (endDate && localOrderDate > endDate) return false;
      }
      if (filterDept !== 'All Departments' && order.departmentId?.name !== filterDept) return false;
      return true;
  });

  const categoryRevenue = {};
  filteredOrders.forEach(o => { o.items.forEach(i => { categoryRevenue[i.category] = (categoryRevenue[i.category] || 0) + (i.price * i.quantity); }); });
  
  const itemCounts = {};
  filteredOrders.forEach(o => { o.items.forEach(i => { itemCounts[i.itemName] = (itemCounts[i.itemName] || 0) + i.quantity; }); });
  const popularItems = Object.entries(itemCounts).sort((a,b) => b[1] - a[1]).slice(0, 5);

  const feedbackOrders = orders.filter(o => o.rating);
  const averageRating = feedbackOrders.length > 0 
      ? (feedbackOrders.reduce((sum, o) => sum + o.rating, 0) / feedbackOrders.length).toFixed(1) : 0;

  // 🚀 FIXED ACTION: CANCEL/DELETE ORDER
  const cancelOrder = async (orderId) => {
    if (window.confirm("Permanently delete this order? It will be removed from all reports.")) {
        try {
            await API.delete(`/orders/delete/${orderId}`);
            toast.success("Order Deleted");
            fetchOrders(); 
        } catch (err) { 
            console.error(err);
            toast.error("Failed to cancel. Check backend route /delete/:id"); 
        }
    }
  };

  // 🚀 FIXED ACTION: COMPLETE & AUTO-PRINT
  const completeOrder = async (order) => {
    try {
        await API.put(`/orders/${order._id}/status`, { status: 'Completed' });
        toast.success("Order Completed!");
        printReceipt(order); 
        fetchOrders();
    } catch (err) { toast.error("Update failed."); }
  };

  const printReceipt = (order) => {
    const doc = new jsPDF({ format: [80, 150] }); 
    doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.text("PICT CANTEEN", 40, 12, { align: "center" });
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text("------------------------------------------", 40, 18, { align: "center" });
    doc.text(`DATE: ${new Date().toLocaleString()}`, 10, 24);
    doc.text(`BILL TO: ${order.voucherCode?.startsWith('G-') ? order.guestName : order.facultyId?.fullName}`, 10, 29);
    doc.text("------------------------------------------", 40, 40, { align: "center" });
    let y = 46;
    order.items.forEach(i => { doc.text(`${i.itemName} x${i.quantity}`, 10, y); doc.text(`Rs.${i.price * i.quantity}`, 70, y, { align: "right" }); y += 6; });
    doc.text("------------------------------------------", 40, y + 2, { align: "center" });
    doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.text(`TOTAL: Rs. ${order.totalAmount}`, 10, y + 10);
    
    // Auto Print Trigger
    const blob = doc.output('bloburl');
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = blob;
    document.body.appendChild(iframe);
    iframe.contentWindow.print();
  };

  const downloadReport = () => {
    const doc = new jsPDF();
    const img = new Image(); img.src = '/image1.jpeg'; 
    img.onload = () => {
      // 🚀 RESTORED ORIGINAL PICT PDF FORMAT (WITH SECTION A & B)
      doc.setGState(new doc.GState({ opacity: 0.15 }));
      doc.addImage(img, 'JPEG', 35, 70, 140, 140);
      doc.setGState(new doc.GState({ opacity: 1.0 })); 
      doc.addImage(img, 'JPEG', 14, 10, 22, 22);
      doc.setFontSize(16); doc.setFont("helvetica", "bold");
      doc.text("SCTR'S PUNE INSTITUTE OF COMPUTER TECHNOLOGY", 42, 18);
      doc.setFontSize(11); doc.setFont("helvetica", "normal");
      doc.text("Office of the Mess & Canteen Section", 42, 24);
      doc.rect(55, 30, 100, 8); doc.setFont("helvetica", "bold"); doc.text("DEPARTMENT-WISE BILLING REPORT", 62, 36);
      doc.setFontSize(10); doc.setFont("helvetica", "normal");
      doc.text(`Ref No: PICT/CNTN/${new Date().toISOString().split('T')[0].replace(/-/g, '')}/ALL-01`, 14, 50);
      doc.text(`Date: ${startDate} to ${endDate}`, 140, 50);
      doc.setFont("helvetica", "bold"); doc.text(`Department: ${filterDept.toUpperCase()}`, 14, 58);

      const facultyOrders = filteredOrders.filter(o => !o.voucherCode?.startsWith('G-'));
      const guestOrders = filteredOrders.filter(o => o.voucherCode?.startsWith('G-'));

      const facultyTotals = {};
      facultyOrders.forEach(order => {
          const rawDate = new Date(order.createdAt || order.orderDate).toLocaleDateString('en-GB');
          const orderDateIso = new Date(order.createdAt || order.orderDate).toISOString().split('T')[0];
          const baseName = order.facultyId?.fullName || 'Faculty';
          const matchedFaculty = allFaculty.find(f => (order.facultyId && f._id === (order.facultyId._id || order.facultyId)));
          const yearScope = matchedFaculty?.academicYear || 'N/A';
          let sub = 'Duty/Other';
          if (matchedFaculty?.assignedSubjects) {
              const m = matchedFaculty.assignedSubjects.find(s => { const p = s.split('|'); return p.length === 3 && orderDateIso >= p[0] && orderDateIso <= p[1]; });
              if(m) sub = m.split('|')[2];
          }
          const key = `${baseName}_${rawDate}`; 
          if (!facultyTotals[key]) facultyTotals[key] = { name: baseName, date: rawDate, details: `${yearScope}\n${sub}`, items: [], total: 0 };
          facultyTotals[key].total += order.totalAmount;
          facultyTotals[key].items.push(order.items.map(i => `${i.itemName}(x${i.quantity})`).join(', '));
      });

      const guestTotals = {};
      guestOrders.forEach(order => {
          const rawDate = new Date(order.createdAt || order.orderDate).toLocaleDateString('en-GB');
          const orderDateIso = new Date(order.createdAt || order.orderDate).toISOString().split('T')[0];
          const actualGuestName = order.guestName || 'Guest';
          const hostFaculty = allFaculty.find(f => (order.facultyId && f._id === (order.facultyId._id || order.facultyId)));
          const yearScope = hostFaculty?.academicYear || 'N/A';
          let sub = 'Duty/Other';
          if (hostFaculty?.assignedSubjects) {
              const m = hostFaculty.assignedSubjects.find(s => { const p = s.split('|'); return p.length === 3 && orderDateIso >= p[0] && orderDateIso <= p[1]; });
              if(m) sub = m.split('|')[2];
          }
          const key = `${actualGuestName}_${rawDate}`; 
          if (!guestTotals[key]) guestTotals[key] = { name: `${actualGuestName}\n(Host: ${hostFaculty?.fullName || 'N/A'})`, date: rawDate, details: `${yearScope}\n${sub}`, items: [], total: 0 };
          guestTotals[key].total += order.totalAmount;
          guestTotals[key].items.push(order.items.map(i => `${i.itemName}(x${i.quantity})`).join(', '));
      });

      let currentY = 70;
      doc.text("SECTION A: FACULTY CONSUMPTION", 14, currentY);
      const fTable = Object.values(facultyTotals).map((d, i) => [i + 1, d.date, d.name, d.details, d.items.join(' | '), `Rs. ${d.total}`]);
      autoTable(doc, { startY: currentY + 3, head: [['Sr', 'Date', 'Name', 'Year & Subject', 'Items', 'Total']], body: fTable, theme: 'grid', bodyStyles: { fontStyle: 'bold', fontSize: 9.5 } });
      currentY = doc.lastAutoTable.finalY + 15;
      doc.text("SECTION B: GUEST CONSUMPTION", 14, currentY);
      const gTable = Object.values(guestTotals).map((d, i) => [i + 1, d.date, d.name, d.details, d.items.join(' | '), `Rs. ${d.total}`]);
      autoTable(doc, { startY: currentY + 3, head: [['Sr', 'Date', 'Name', 'Year & Subject', 'Items', 'Total']], body: gTable, theme: 'grid', bodyStyles: { fontStyle: 'bold', fontSize: 9.5 } });
      
      const sigY = Math.min(doc.lastAutoTable.finalY + 30, 260);
      doc.line(20, sigY, 60, sigY); doc.text("MESS MANAGER", 25, sigY + 6);
      doc.line(85, sigY, 135, sigY); doc.text("COORDINATOR", 95, sigY + 6);
      doc.line(160, sigY, 200, sigY); doc.text("PRINCIPAL", 170, sigY + 6);

      doc.save(`PICT_Report_${filterDept}.pdf`);
    };
  };

  const handleMenuSubmit = async (e) => {
    e.preventDefault();
    try {
        if (editingItemId) await API.put(`/menu/update/${editingItemId}`, menuForm);
        else await API.post('/menu/add', menuForm);
        setIsMenuModalOpen(false); setMenuForm({ itemName: '', category: 'Snacks', price: '' }); fetchMenuItems();
        toast.success("Menu Updated");
    } catch (err) { toast.error("Error saving."); }
  };

  const editMenuItem = (item) => {
    setEditingItemId(item._id);
    setMenuForm({ itemName: item.itemName, category: item.category, price: item.price });
    setIsMenuModalOpen(true);
  };

  const toggleAvailability = async (item) => {
    try { await API.put(`/menu/update/${item._id}`, { ...item, isAvailable: !item.isAvailable }); fetchMenuItems(); } catch (err) { }
  };

  const deleteMenuItem = async (id) => {
    if(window.confirm("Delete item?")) {
        try { await API.delete(`/menu/delete/${id}`); fetchMenuItems(); toast.success("Deleted"); } catch (err) { }
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fc] font-sans text-slate-800">
      <header className="bg-white border-b sticky top-0 z-20 shadow-sm flex justify-between items-center px-6 py-4">
          <div className="flex items-center gap-3"><div className="bg-blue-600 text-white p-2.5 rounded-xl shadow-lg"><Utensils size={22} /></div><div><h1 className="text-xl font-black">Canteen Manager</h1><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Kitchen Operations</p></div></div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase border transition-all ${isRefreshing ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-slate-50 text-slate-400'}`}>
                <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} /> {isRefreshing ? 'Syncing...' : 'Live'}
            </div>
            <button onClick={() => { sessionStorage.clear(); navigate('/'); }} className="flex items-center gap-2 text-slate-400 hover:text-red-600 font-bold transition-colors bg-slate-50 px-4 py-2 rounded-lg border hover:bg-red-50"><LogOut size={16} /> Logout</button>
          </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 md:p-8">
          <div className="flex gap-2 border-b mb-6 bg-white p-1.5 rounded-xl shadow-sm border inline-flex overflow-x-auto max-w-full">
              <button onClick={() => setActiveTab('orders')} className={`whitespace-nowrap px-6 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'orders' ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100' : 'text-slate-500 hover:text-slate-800'}`}>Live Orders</button>
              <button onClick={() => setActiveTab('menu')} className={`whitespace-nowrap px-6 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'menu' ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100' : 'text-slate-500 hover:text-slate-800'}`}>Menu Management</button>
              <button onClick={() => setActiveTab('feedback')} className={`whitespace-nowrap px-6 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'feedback' ? 'bg-orange-50 text-orange-700 shadow-sm border border-orange-100' : 'text-slate-500 hover:text-slate-800'}`}>Customer Feedback</button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border p-6 min-h-[600px]">
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
                          <div className="flex-1 min-w-[250px] relative">
                             <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Search Name</label>
                             <div className="relative">
                                <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                                <input type="text" placeholder="Search faculty or guest..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 p-2.5 border-2 border-slate-200 rounded-xl text-sm font-semibold focus:border-blue-500 outline-none" />
                             </div>
                          </div>
                          <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Department</label>
                          <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className="p-2.5 border-2 border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500 bg-white">
                              <option value="All Departments">All Departments</option>
                              {departments.map(d => <option key={d._id} value={d.name}>{d.name}</option>)}
                          </select></div>
                          <button onClick={downloadReport} className="bg-slate-800 hover:bg-black text-white px-5 py-3 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg transition-all active:scale-95"><Download size={18} /> Export PDF</button>
                      </div>

                      <div className="overflow-x-auto border-2 border-slate-100 rounded-2xl shadow-sm">
                          <table className="w-full text-left border-collapse">
                              <thead className="bg-slate-50 border-b-2 border-slate-100 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                                  <tr><th className="py-5 px-6">Billed To</th><th className="py-5 px-6">Department</th><th className="py-5 px-6">Date</th><th className="py-5 px-6">Items</th><th className="py-5 px-6">Amount</th><th className="py-5 px-6 text-right">Actions</th></tr>
                              </thead>
                              <tbody className="divide-y-2 divide-slate-50 text-sm font-medium">
                                  {filteredOrders.map(order => (
                                          <tr key={order._id} className="hover:bg-blue-50/50 transition-colors bg-white">
                                              <td className="py-4 px-6"><p className="font-bold text-slate-800">{order.voucherCode?.startsWith('G-') ? order.guestName : order.facultyId?.fullName}</p></td>
                                              <td className="py-4 px-6"><span className="bg-slate-100 text-slate-600 font-bold px-3 py-1.5 rounded-md text-[10px] border border-slate-200 uppercase">{order.departmentId?.name || 'Unknown'}</span></td>
                                              <td className="py-4 px-6 text-slate-500 text-xs">{new Date(order.createdAt).toLocaleString('en-GB', {day: '2-digit', month: 'short', hour: '2-digit', minute:'2-digit'})}</td>
                                              <td className="py-4 px-6 text-slate-600 text-xs">{order.items?.map(i => `${i.itemName} (x${i.quantity})`).join(', ')}</td>
                                              <td className="py-4 px-6 font-black text-emerald-600 text-base">₹{order.totalAmount}</td>
                                              <td className="py-4 px-6 text-right">
                                                  <div className="flex gap-2 justify-end">
                                                      <button onClick={() => cancelOrder(order._id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Delete Order"><X size={20}/></button>
                                                      <button onClick={() => completeOrder(order)} className="p-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all shadow-md shadow-emerald-100" title="Complete & Print"><Check size={20}/></button>
                                                  </div>
                                              </td>
                                          </tr>
                                      ))
                                  }
                              </tbody>
                          </table>
                      </div>
                  </div>
              )}
              {/* Other tabs follow same pattern */}
          </div>
      </div>
      
      {isMenuModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
              <div className="bg-white p-8 rounded-3xl w-full max-w-sm shadow-2xl animate-in zoom-in duration-200 border border-slate-100">
                  <h2 className="text-2xl font-black mb-6">Menu Item</h2>
                  <form onSubmit={handleMenuSubmit} className="space-y-4">
                      <input required type="text" placeholder="Item Name" value={menuForm.itemName} onChange={(e) => setMenuForm({...menuForm, itemName: e.target.value})} className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold" />
                      <select value={menuForm.category} onChange={(e) => setMenuForm({...menuForm, category: e.target.value})} className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold">
                          <option value="Beverages">Beverages</option><option value="Snacks">Snacks</option><option value="Lunch">Lunch</option><option value="Dessert">Dessert</option>
                      </select>
                      <input required type="number" placeholder="Price" value={menuForm.price} onChange={(e) => setMenuForm({...menuForm, price: e.target.value})} className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold" />
                      <div className="flex gap-3 pt-4"><button type="button" onClick={() => setIsMenuModalOpen(false)} className="flex-1 py-3.5 border-2 font-bold rounded-xl">Cancel</button><button type="submit" className="flex-1 py-3.5 bg-blue-600 text-white font-black rounded-xl">Save</button></div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};

export default CanteenManagerDashboard;