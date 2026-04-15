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
            setOrders(prevOrders => res.data.length !== prevOrders.length ? res.data : prevOrders);
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
      const orderName = (order.voucherCode?.startsWith('G-') ? order.guestName : order.facultyId?.fullName) || "";
      if (!orderName.toLowerCase().includes(searchTerm.toLowerCase())) return false; // 🚀 Search Filter

      if (order.createdAt || order.orderDate) {
          const localOrderDate = getLocalYYYYMMDD(new Date(order.createdAt || order.orderDate));
          if (startDate && localOrderDate < startDate) return false;
          if (endDate && localOrderDate > endDate) return false;
      }

      if (filterDept !== 'All Departments') {
          if (order.departmentId?.name !== filterDept) return false;
      }
      return true;
  });

  const itemCounts = {};
  filteredOrders.forEach(o => {
    o.items.forEach(i => { itemCounts[i.itemName] = (itemCounts[i.itemName] || 0) + i.quantity; });
  });
  const popularItems = Object.entries(itemCounts).sort((a,b) => b[1] - a[1]).slice(0, 5);

  const categoryRevenue = {};
  filteredOrders.forEach(o => {
    o.items.forEach(i => { categoryRevenue[i.category] = (categoryRevenue[i.category] || 0) + (i.price * i.quantity); });
  });

  const averageRating = orders.filter(o => o.rating).length > 0 
      ? (orders.filter(o => o.rating).reduce((sum, o) => sum + o.rating, 0) / orders.filter(o => o.rating).length).toFixed(1) : 0;

  // 🚀 Order Management Actions
  const completeOrder = async (order) => {
    try {
        await API.put(`/orders/${order._id}/status`, { status: 'Completed' });
        toast.success("Order Completed!");
        printReceipt(order); // Automatically trigger print
        fetchOrders();
    } catch (err) { toast.error("Failed to complete order."); }
  };

  const cancelOrder = async (orderId) => {
    if (window.confirm("Are you sure you want to cancel this order?")) {
        try {
            await API.delete(`/orders/delete/${orderId}`);
            toast.success("Order Cancelled.");
            fetchOrders();
        } catch (err) { toast.error("Failed to cancel order."); }
    }
  };

  const handleMenuSubmit = async (e) => {
      e.preventDefault();
      const maxLimit = categoryPriceLimits[menuForm.category];
      if (maxLimit && Number(menuForm.price) > maxLimit) { toast.error(`Max price for ${menuForm.category} is ₹${maxLimit}.`); return; }
      try {
          if (editingItemId) await API.put(`/menu/update/${editingItemId}`, menuForm);
          else await API.post('/menu/add', menuForm);
          setIsMenuModalOpen(false); setMenuForm({ itemName: '', category: 'Snacks', price: '' }); fetchMenuItems();
          toast.success("Menu updated!");
      } catch (err) { toast.error("Failed to save."); }
  };

  const toggleAvailability = async (item) => {
      try { await API.put(`/menu/update/${item._id}`, { ...item, isAvailable: !item.isAvailable }); fetchMenuItems(); } 
      catch (err) { console.error("Failed to update availability"); }
  };

  const printReceipt = (order) => {
    const doc = new jsPDF({ format: [80, 150] }); 
    doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.text("PICT CANTEEN", 40, 12, { align: "center" });
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text("------------------------------------------", 40, 18, { align: "center" });
    doc.text(`DATE: ${new Date().toLocaleString()}`, 10, 24);
    doc.text(`BILL TO: ${order.voucherCode?.startsWith('G-') ? order.guestName : order.facultyId?.fullName}`, 10, 29);
    doc.text(`DEPT: ${order.departmentId?.name || 'N/A'}`, 10, 34);
    doc.text("------------------------------------------", 40, 40, { align: "center" });
    let y = 46;
    order.items.forEach(i => {
        doc.text(`${i.itemName} x${i.quantity}`, 10, y);
        doc.text(`Rs.${i.price * i.quantity}`, 70, y, { align: "right" });
        y += 6;
    });
    doc.text("------------------------------------------", 40, y + 2, { align: "center" });
    doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text(`TOTAL: Rs. ${order.totalAmount}`, 10, y + 10);
    
    // 🚀 THE FIX: Trigger real print dialog rather than just downloading
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  };

  const downloadReport = () => {
    const doc = new jsPDF();
    const img = new Image(); img.src = '/image1.jpeg'; 
    img.onload = () => {
      doc.setGState(new doc.GState({ opacity: 0.15 })); doc.addImage(img, 'JPEG', 35, 70, 140, 140);
      doc.setGState(new doc.GState({ opacity: 1.0 })); doc.addImage(img, 'JPEG', 14, 10, 22, 22);
      doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.text("SCTR'S PUNE INSTITUTE OF COMPUTER TECHNOLOGY", 42, 18);
      doc.setFontSize(10); doc.text(`Department Report: ${filterDept.toUpperCase()}`, 14, 58);
      const data = filteredOrders.map((o, i) => [i + 1, new Date(o.createdAt).toLocaleDateString(), (o.voucherCode?.startsWith('G-') ? o.guestName : o.facultyId?.fullName), o.items.map(it => it.itemName).join(', '), `Rs. ${o.totalAmount}`]);
      autoTable(doc, { startY: 65, head: [['Sr', 'Date', 'Name', 'Items', 'Total']], body: data, theme: 'grid' });
      doc.save(`Canteen_Report_${filterDept}.pdf`);
    };
  };

  return (
    <div className="min-h-screen bg-[#f8f9fc] font-sans text-slate-800">
      <header className="bg-white border-b sticky top-0 z-20 shadow-sm flex justify-between items-center px-6 py-4">
          <div className="flex items-center gap-3"><div className="bg-blue-600 text-white p-2.5 rounded-xl"><Utensils size={22} /></div><div><h1 className="text-xl font-black">Canteen Manager</h1><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Kitchen Operations</p></div></div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${isRefreshing ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-slate-50 text-slate-400'}`}>
                <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} /> {isRefreshing ? 'Syncing...' : 'Live'}
            </div>
            <button onClick={() => { sessionStorage.clear(); navigate('/'); }} className="flex items-center gap-2 text-slate-400 hover:text-red-600 font-bold transition-colors bg-slate-50 px-4 py-2 rounded-lg border hover:bg-red-50"><LogOut size={16} /> Logout</button>
          </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 md:p-8">
          <div className="flex gap-2 border-b mb-6 bg-white p-1.5 rounded-xl shadow-sm border inline-flex overflow-x-auto max-w-full">
              <button onClick={() => setActiveTab('orders')} className={`whitespace-nowrap px-6 py-2.5 text-sm font-bold rounded-lg ${activeTab === 'orders' ? 'bg-blue-50 text-blue-700' : 'text-slate-500'}`}>Live Orders</button>
              <button onClick={() => setActiveTab('menu')} className={`whitespace-nowrap px-6 py-2.5 text-sm font-bold rounded-lg ${activeTab === 'menu' ? 'bg-blue-50 text-blue-700' : 'text-slate-500'}`}>Menu Management</button>
              <button onClick={() => setActiveTab('feedback')} className={`whitespace-nowrap px-6 py-2.5 text-sm font-bold rounded-lg ${activeTab === 'feedback' ? 'bg-orange-50 text-orange-700' : 'text-slate-500'}`}>Customer Feedback</button>
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
                          {/* 🚀 NEW: Search Bar */}
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
                          <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">From</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="p-2.5 border-2 border-slate-200 rounded-xl text-sm font-semibold" /></div>
                          <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">To</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="p-2.5 border-2 border-slate-200 rounded-xl text-sm font-semibold" /></div>
                          <button onClick={downloadReport} className="bg-slate-800 hover:bg-black text-white px-5 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all"><Download size={18} /> PDF</button>
                      </div>

                      <div className="overflow-x-auto border-2 border-slate-100 rounded-2xl shadow-sm">
                          <table className="w-full text-left border-collapse">
                              <thead className="bg-slate-50 border-b-2 border-slate-100 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                                  <tr><th className="py-5 px-6">Billed To</th><th className="py-5 px-6">Department</th><th className="py-5 px-6">Date</th><th className="py-5 px-6">Items</th><th className="py-5 px-6">Amount</th><th className="py-5 px-6 text-right">Actions</th></tr>
                              </thead>
                              <tbody className="divide-y-2 divide-slate-50 text-sm font-medium">
                                  {filteredOrders.map(order => (
                                          <tr key={order._id} className="hover:bg-blue-50/50 bg-white group">
                                              <td className="py-4 px-6"><p className="font-bold text-slate-800">{order.voucherCode?.startsWith('G-') ? order.guestName : order.facultyId?.fullName}</p></td>
                                              <td className="py-4 px-6"><span className="bg-slate-100 text-slate-600 font-bold px-3 py-1 rounded-md text-[10px] uppercase border">{order.departmentId?.name || 'Unknown'}</span></td>
                                              <td className="py-4 px-6 text-slate-500 text-xs">{new Date(order.createdAt).toLocaleString('en-GB', {day: '2-digit', month: 'short', hour: '2-digit', minute:'2-digit'})}</td>
                                              <td className="py-4 px-6 text-slate-600 text-xs">{order.items?.map(i => `${i.itemName} (x${i.quantity})`).join(', ')}</td>
                                              <td className="py-4 px-6 font-black text-emerald-600 text-base">₹{order.totalAmount}</td>
                                              <td className="py-4 px-6 text-right">
                                                  <div className="flex gap-2 justify-end">
                                                      {/* 🚀 Action Buttons: Cancel and Complete */}
                                                      <button onClick={() => cancelOrder(order._id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Cancel Order"><X size={20}/></button>
                                                      <button onClick={() => completeOrder(order)} className="p-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all shadow-md shadow-emerald-100" title="Complete & Print Receipt"><Check size={20}/></button>
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

              {/* MENU & FEEDBACK UNCHANGED... */}
              {activeTab === 'menu' && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {menuItems.map(item => (
                        <div key={item._id} className="border-2 p-5 rounded-2xl flex justify-between bg-white group hover:border-blue-200">
                            <div><span className="text-[9px] font-black text-blue-600 uppercase">{item.category}</span><h3 className="font-black text-lg">{item.itemName}</h3><p className="font-black text-slate-500">₹{item.price}</p></div>
                            <div className="flex flex-col gap-2">
                                <button onClick={() => toggleAvailability(item)} className={`p-2 rounded-xl ${item.isAvailable !== false ? 'border text-red-500' : 'bg-emerald-500 text-white'}`}>{item.isAvailable !== false ? <PowerOff size={18}/> : <Power size={18}/>}</button>
                                <button onClick={() => editMenuItem(item)} className="p-2 border rounded-xl text-slate-400 hover:text-blue-600"><Edit size={18}/></button>
                                <button onClick={() => deleteMenuItem(item._id)} className="p-2 border rounded-xl text-slate-400 hover:text-red-600"><Trash2 size={18}/></button>
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