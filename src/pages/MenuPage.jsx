import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { 
  Utensils, LogOut, Trash2, CheckCircle, Ticket, X, UtensilsCrossed, Plus, 
  Mail, ChevronRight, Check, Clock, History, Star, User, ChevronDown, ChevronUp 
} from 'lucide-react';
import toast from 'react-hot-toast';

const categorySchedules = {
  'Breakfast': { start: 7, end: 12, label: 'Available 7:00 AM - 12:00 PM' },
  'Beverages': { start: 8, end: 12, label: 'Available 8:00 AM - 12:00 PM' },
  'Quick Bites': { start: 7, end: 18, label: 'Available 7:00 AM - 6:30 PM' },
  'Fasting Specials (Upvas)': { 
    start: 8, 
    end: 16, 
    label: 'Available Mon, Tue, Thu, Sat', 
    days: [1, 2, 4, 6] 
  },
  'Lunch': { start: 12, end: 15, label: 'Available 12:00 PM - 3:00 PM' },
  'Dessert': { start: 7, end: 18, label: 'Available All Day' }
};

const MenuPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('activeMenuTab') || 'menu');
  
  // 🚀 IDEA 4: Exclusive Accordion State
  const [openCategory, setOpenCategory] = useState(null);

  const [menuItems, setMenuItems] = useState([]); 
  const [myGuests, setMyGuests] = useState([]); 
  const [myOrders, setMyOrders] = useState([]); 
  const [selections, setSelections] = useState({});
  const [actionLocks, setActionLocks] = useState({
      checkout: false,
      addGuest: false,
      feedback: false,
      cancelingOrderId: null
  });

  const isVoucherActiveToday = (validFromValue, validTillValue, nowValue = new Date()) => {
    const now = new Date(nowValue);
    const validFrom = new Date(validFromValue);
    const validTill = new Date(validTillValue);

    now.setHours(0, 0, 0, 0);
    validFrom.setHours(0, 0, 0, 0);
    validTill.setHours(23, 59, 59, 999);

    return now >= validFrom && now <= validTill;
  };
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [facultyLimits, setFacultyLimits] = useState({ 
      minDate: new Date().toISOString().split('T')[0], 
      maxDate: new Date().toISOString().split('T')[0] 
  });

  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);
  const [guestFormData, setGuestFormData] = useState({
      guestName: '', email: '', 
      validFrom: '', 
      validTill: ''
  });

  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackData, setFeedbackData] = useState({ orderId: null, rating: 5, text: '' });

  const voucher = sessionStorage.getItem('userVoucher') || 'Unknown';
  const userName = sessionStorage.getItem('userName') || 'User';
  const userRole = sessionStorage.getItem('userRole') || 'GUEST'; 
  const currentHour = new Date().getHours();
  const [selectedVoucher, setSelectedVoucher] = useState(voucher);

  useEffect(() => {
    sessionStorage.setItem('activeMenuTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (voucher === 'Unknown') {
        navigate('/');
        return;
    }
    const fetchMenu = async () => {
      try {
        const res = await API.get('/menu/all');
        if (Array.isArray(res.data)) setMenuItems(res.data);
      } catch (err) { console.error("Menu fetch error", err); }
    };

    fetchMenu();
    fetchMyOrders();
    if (userRole === 'FACULTY') {
        fetchMyGuests();
        fetchFacultyLimits();
    }
  }, [voucher, userRole, navigate]);

  const fetchFacultyLimits = async () => {
      try {
          const res = await API.get(`/guests/profile/${voucher}`);
          const min = new Date(res.data.validFrom).toISOString().split('T')[0];
          const max = new Date(res.data.validTill).toISOString().split('T')[0];
          setFacultyLimits({ minDate: min, maxDate: max });
          setGuestFormData(prev => ({...prev, validFrom: min, validTill: max}));
      } catch(err) { console.error("Failed limits", err); }
  }

  const fetchMyGuests = async () => {
      try {
          const res = await API.get(`/guests/faculty/${voucher}`);
          if (Array.isArray(res.data)) setMyGuests(res.data);
      } catch (err) { console.error(err); }
  };

  const fetchMyOrders = async () => {
      try {
          const res = await API.get(`/orders/history/${voucher}`);
          if (Array.isArray(res.data)) setMyOrders(res.data);
      } catch (err) { console.error(err); }
  };

  const toggleSelection = (item) => {
    const category = item.category || 'Other';
    const schedule = categorySchedules[category];
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    const isTimeValid = schedule ? (currentHour >= schedule.start && currentHour < schedule.end) : true;
    const isDayValid = schedule?.days ? schedule.days.includes(currentDay) : true;

    if (item.isAvailable === false || !isTimeValid || !isDayValid) {
      if (!isDayValid) toast.error("Not available today.");
      return;
    }
    
    // 🚀 CART PERSISTENCE: State is independent of accordion toggle
    setSelections((prev) => {
      const current = { ...prev };
      if (current[category]?._id === item._id) delete current[category];
      else current[category] = item;
      return current;
    });
  };

  const removeSelection = (category) => {
    setSelections((prev) => {
      const current = { ...prev };
      delete current[category];
      return current;
    });
  };

  const groupedMenu = menuItems.reduce((acc, item) => {
      const cat = item.category || 'Other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
  }, {});

  const handleCheckout = async () => {
    if (actionLocks.checkout || Object.keys(selections).length === 0) return;
    setActionLocks(prev => ({ ...prev, checkout: true }));
    try {
      const totalAmount = Object.values(selections).reduce((acc, i) => acc + i.price, 0);
      await API.post('/orders/place', {
        voucherCode: selectedVoucher, 
        items: Object.values(selections).map(i => ({ itemName: i.itemName, category: i.category, quantity: 1, price: i.price })),
        totalAmount
      });
      setOrderSuccess(true);
      setSelections({});
      toast.success("Order Placed!"); 
      fetchMyOrders(); 
      setTimeout(() => setOrderSuccess(false), 3000);
    } catch (err) { toast.error(err.response?.data?.error || "Order failed."); } 
    finally { setActionLocks(prev => ({ ...prev, checkout: false })); }
  };

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    if (actionLocks.feedback) return;
    setActionLocks(prev => ({ ...prev, feedback: true }));
    try {
        await API.put(`/orders/feedback/${feedbackData.orderId}`, { rating: feedbackData.rating, feedbackText: feedbackData.text });
        toast.success("Feedback submitted!"); setIsFeedbackModalOpen(false); fetchMyOrders(); 
    } catch (err) { toast.error("Failed."); } finally { setActionLocks(prev => ({ ...prev, feedback: false })); }
  };

  const handleCancelOrder = async (orderId) => {
      if (!window.confirm('Cancel order?')) return;
      setActionLocks(prev => ({ ...prev, cancelingOrderId: orderId }));
      try {
          await API.delete(`/orders/cancel/${orderId}`, { data: { voucherCode: voucher } });
          toast.success('Canceled.'); fetchMyOrders();
      } catch (err) { toast.error('Error.'); } finally { setActionLocks(prev => ({ ...prev, cancelingOrderId: null })); }
  };

  const handleAddGuest = async (e) => {
    e.preventDefault();
    if (actionLocks.addGuest) return;
    setActionLocks(prev => ({ ...prev, addGuest: true }));
    try {
        const res = await API.post('/guests/add', { ...guestFormData, facultyVoucher: voucher });
        toast.success(`Guest Code: ${res.data.voucher}`); 
        setIsGuestModalOpen(false);
        setGuestFormData({ guestName: '', email: '', validFrom: facultyLimits.minDate, validTill: facultyLimits.maxDate });
        fetchMyGuests(); 
    } catch (err) { toast.error("Failed to add guest"); } finally { setActionLocks(prev => ({ ...prev, addGuest: false })); }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans antialiased text-slate-800">
      
      {/* HEADER */}
      <header className="bg-[#0f2040] text-white shadow-md z-30 sticky top-0">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/10 rounded border border-white/20 flex items-center justify-center font-bold text-blue-300">P</div>
                <div>
                    <h1 className="text-base font-bold uppercase tracking-tight">PICT Canteen</h1>
                    <p className="text-[10px] text-slate-300">Welcome, {userName} <span className="ml-1 bg-blue-600/30 px-1 rounded text-[9px]">{userRole}</span></p>
                </div>
            </div>
            <div className="flex gap-2">
                {userRole === 'FACULTY' && <button onClick={() => setIsGuestModalOpen(true)} className="bg-purple-600 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5"><Ticket size={14}/> Guest Pass</button>}
                <button onClick={() => { sessionStorage.clear(); navigate('/'); }} className="border border-slate-500 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-600 transition-colors"><LogOut size={14}/></button>
            </div>
        </div>
      </header>

      {/* TABS */}
      <div className="bg-white border-b sticky top-[56px] z-20 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 flex gap-8 overflow-x-auto no-scrollbar">
              <button onClick={() => setActiveTab('menu')} className={`py-4 text-xs font-black border-b-2 transition-all tracking-widest ${activeTab === 'menu' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400'}`}>MENU</button>
              {userRole === 'FACULTY' && <button onClick={() => setActiveTab('guests')} className={`py-4 text-xs font-black border-b-2 transition-all tracking-widest ${activeTab === 'guests' ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-400'}`}>GUESTS</button>}
              <button onClick={() => setActiveTab('history')} className={`py-4 text-xs font-black border-b-2 transition-all tracking-widest ${activeTab === 'history' ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-400'}`}>HISTORY & REVIEWS</button>
          </div>
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 lg:p-8">
          
          {activeTab === 'menu' && (
            <div className="flex flex-col lg:flex-row gap-8 items-start">
              {/* 🚀 ACCORDION SECTION (Left side on Laptop) */}
              <div className="flex-1 w-full space-y-4">
                {Object.entries(groupedMenu).map(([category, items]) => {
                  const isOpen = openCategory === category;
                  const hasSelection = selections[category];
                  const schedule = categorySchedules[category];

                  return (
                    <div key={category} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm transition-all">
                      <button 
                        onClick={() => setOpenCategory(isOpen ? null : category)}
                        className={`w-full flex justify-between items-center p-5 text-left transition-colors ${isOpen ? 'bg-slate-50' : 'hover:bg-slate-50/50'}`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                             <h3 className="font-black text-slate-700 uppercase tracking-tighter text-sm">{category}</h3>
                             {hasSelection && <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>}
                          </div>
                          <p className="text-[10px] font-bold text-slate-400 mt-1">{schedule?.label || 'Available'}</p>
                        </div>
                        {isOpen ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                      </button>

                      {/* Smooth Content Area */}
                      <div className={`transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[1000px] border-t p-4 opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-3">
                          {items.map(item => {
                             const isSelected = selections[category]?._id === item._id;
                             const isAvailable = item.isAvailable !== false;
                             return (
                               <div 
                                 key={item._id} 
                                 onClick={() => toggleSelection(item)}
                                 className={`p-4 rounded-xl border-2 flex justify-between items-center cursor-pointer transition-all ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:border-slate-200'}`}
                               >
                                 <div className="overflow-hidden">
                                   <p className={`font-bold text-sm truncate ${!isAvailable ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{item.itemName}</p>
                                   <p className="text-sm font-black text-slate-500">₹{item.price}</p>
                                 </div>
                                 <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-300'}`}>
                                    {isSelected ? <Check size={14}/> : <Plus size={14}/>}
                                 </div>
                               </div>
                             );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 🚀 CART SIDEBAR (Right side on Laptop) */}
              <div className="w-full lg:w-80 shrink-0 sticky top-32">
                <div className="bg-white p-6 rounded-2xl border shadow-xl">
                   {userRole === 'FACULTY' && (
                     <div className="mb-4">
                        <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Order For</label>
                        <select value={selectedVoucher} onChange={(e) => setSelectedVoucher(e.target.value)} className="w-full p-2 border rounded-lg font-bold text-sm bg-slate-50 outline-none">
                            <option value={voucher}>My Voucher</option>
                            {myGuests.filter(g => isVoucherActiveToday(g.validFrom, g.validTill) && g.isActive).map(g => <option key={g._id} value={g.voucherCode}>{g.guestName}</option>)}
                        </select>
                     </div>
                   )}
                   <h2 className="font-black text-lg flex items-center gap-2 border-b pb-3 mb-4"><Utensils size={20}/> Your Cart</h2>
                   
                   {orderSuccess && <div className="mb-4 p-2 bg-green-50 text-green-600 text-[10px] font-black rounded border border-green-100 text-center uppercase">Success! Order Placed.</div>}

                   <div className="space-y-3 mb-6 max-h-60 overflow-y-auto no-scrollbar">
                      {Object.values(selections).length === 0 ? <p className="text-center text-slate-400 text-xs py-8 italic">Please select items from the menu</p> : 
                        Object.values(selections).map(item => (
                          <div key={item._id} className="flex justify-between items-center animate-in fade-in slide-in-from-right-2">
                             <div className="overflow-hidden pr-2">
                               <p className="text-xs font-black text-blue-600 uppercase text-[9px]">{item.category}</p>
                               <p className="text-xs font-bold text-slate-700 truncate">{item.itemName}</p>
                             </div>
                             <div className="flex items-center gap-2">
                               <span className="text-xs font-black">₹{item.price}</span>
                               <button onClick={() => removeSelection(item.category)} className="text-red-400"><Trash2 size={14}/></button>
                             </div>
                          </div>
                        ))
                      }
                   </div>

                   {Object.keys(selections).length > 0 && (
                     <div className="border-t pt-4">
                        <div className="flex justify-between items-center mb-6">
                           <span className="text-xs font-black text-slate-400 uppercase">Total Payable</span>
                           <span className="text-2xl font-black text-slate-800">₹{Object.values(selections).reduce((a,b) => a+b.price, 0)}</span>
                        </div>
                        <button onClick={handleCheckout} disabled={actionLocks.checkout} className="w-full bg-blue-600 text-white py-4 rounded-xl font-black text-sm shadow-lg shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all">
                           {actionLocks.checkout ? "WAIT..." : "CONFIRM & PLACE ORDER"}
                        </button>
                     </div>
                   )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: GUESTS */}
          {activeTab === 'guests' && (
             <div className="w-full bg-white rounded-2xl border shadow-sm overflow-hidden animate-in fade-in">
                <div className="p-6 border-b flex justify-between items-center"><h2 className="font-black text-lg uppercase tracking-tight">Active Guest Passes</h2><button onClick={() => setIsGuestModalOpen(true)} className="p-2 bg-purple-100 text-purple-600 rounded-lg"><Plus size={20}/></button></div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
                        <tr><th className="p-5">Guest Name</th><th className="p-5">Code</th><th className="p-5">Validity</th><th className="p-5 text-center">Status</th></tr>
                      </thead>
                      <tbody className="divide-y text-sm">
                        {myGuests.map(g => (
                          <tr key={g._id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-5 font-bold">{g.guestName}</td>
                            <td className="p-5 font-mono font-bold text-purple-600">{g.voucherCode}</td>
                            <td className="p-5 text-xs text-slate-500 font-medium">{new Date(g.validTill).toLocaleDateString('en-GB')}</td>
                            <td className="p-5 text-center">{isVoucherActiveToday(g.validFrom, g.validTill) ? <span className="text-green-600 font-bold bg-green-50 px-2 py-1 rounded text-[10px]">ACTIVE</span> : <span className="text-red-500 font-bold bg-red-50 px-2 py-1 rounded text-[10px]">EXPIRED</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                </div>
             </div>
          )}

          {/* TAB: HISTORY & REVIEWS (RESTORED) */}
          {activeTab === 'history' && (
             <div className="w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4">
                {myOrders.length === 0 ? <div className="col-span-full py-20 text-center text-slate-400 italic">No history found.</div> : 
                  myOrders.map(order => (
                    <div key={order._id} className="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-sm flex flex-col justify-between hover:border-blue-200 transition-all">
                      <div>
                        <div className="flex justify-between items-start mb-4">
                           <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-2 py-1 rounded uppercase">{new Date(order.createdAt).toLocaleDateString('en-GB')}</span>
                           <span className={`text-[10px] font-black px-2 py-1 rounded uppercase ${order.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-600'}`}>{order.status}</span>
                        </div>
                        <div className="space-y-1 mb-4">
                           {order.items.map((i, idx) => <p key={idx} className="text-sm font-bold text-slate-800 flex justify-between">{i.itemName} <span className="text-slate-400">x{i.quantity}</span></p>)}
                        </div>
                      </div>
                      <div className="pt-4 border-t flex justify-between items-center">
                        <span className="font-black text-lg">₹{order.totalAmount}</span>
                        <div className="flex gap-2">
                           {/* 🚀 FEEDBACK RESTORED */}
                           {order.status === 'Completed' && !order.rating && (
                             <button onClick={() => { setFeedbackData({ orderId: order._id, rating: 5, text: '' }); setIsFeedbackModalOpen(true); }} className="text-[10px] font-black bg-orange-500 text-white px-3 py-2 rounded-lg hover:bg-orange-600 flex items-center gap-1 shadow-md shadow-orange-100">
                                <Star size={12} fill="white"/> FEEDBACK
                             </button>
                           )}
                           {order.rating && (
                             <div className="flex text-orange-400 gap-0.5">
                               {[...Array(order.rating)].map((_, i) => <Star key={i} size={14} fill="currentColor"/>)}
                             </div>
                           )}
                           {order.status !== 'Completed' && (
                             <button onClick={() => handleCancelOrder(order._id)} className="text-[10px] font-black text-red-500 bg-red-50 px-3 py-2 rounded-lg border border-red-100">CANCEL</button>
                           )}
                        </div>
                      </div>
                    </div>
                  ))
                }
             </div>
          )}
      </main>

      {/* FEEDBACK MODAL (RESTORED) */}
      {isFeedbackModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-in zoom-in duration-200">
            <h2 className="text-xl font-black mb-2 text-center uppercase tracking-tight">Rate Your Meal</h2>
            <p className="text-slate-400 text-xs text-center mb-8">Help us improve PICT Canteen.</p>
            <div className="flex justify-center gap-3 mb-8">
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} onClick={() => setFeedbackData({...feedbackData, rating: star})} className="hover:scale-125 transition-transform duration-200">
                  <Star size={32} fill={star <= feedbackData.rating ? "#f59e0b" : "none"} className={star <= feedbackData.rating ? "text-yellow-500" : "text-slate-200"} />
                </button>
              ))}
            </div>
            <textarea rows="3" placeholder="Any comments on the taste?" value={feedbackData.text} onChange={(e) => setFeedbackData({...feedbackData, text: e.target.value})} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl mb-6 text-sm outline-none focus:border-orange-500 transition-all resize-none"></textarea>
            <button onClick={handleFeedbackSubmit} className="w-full bg-orange-500 text-white font-black py-4 rounded-xl shadow-lg shadow-orange-100 hover:bg-orange-600 transition-colors">SUBMIT REVIEW</button>
          </div>
        </div>
      )}

      {/* GUEST MODAL */}
      {isGuestModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-black uppercase tracking-tight">New Guest Pass</h2><button onClick={() => setIsGuestModalOpen(false)} className="text-slate-400 hover:rotate-90 transition-transform"><X/></button></div>
            <form onSubmit={handleAddGuest} className="space-y-5">
              <input required type="text" placeholder="Guest Name" value={guestFormData.guestName} onChange={(e) => setGuestFormData({...guestFormData, guestName: e.target.value})} className="w-full p-4 bg-slate-50 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-bold text-sm" />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase">From</label><input required type="date" min={facultyLimits.minDate} max={facultyLimits.maxDate} value={guestFormData.validFrom} onChange={(e) => setGuestFormData({...guestFormData, validFrom: e.target.value})} className="w-full p-2 border rounded-lg text-xs font-bold text-slate-600" /></div>
                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase">Till</label><input required type="date" min={facultyLimits.minDate} max={facultyLimits.maxDate} value={guestFormData.validTill} onChange={(e) => setGuestFormData({...guestFormData, validTill: e.target.value})} className="w-full p-2 border rounded-lg text-xs font-bold text-slate-600" /></div>
              </div>
              <button type="submit" disabled={actionLocks.addGuest} className="w-full bg-purple-600 text-white font-black py-4 rounded-xl shadow-lg shadow-purple-100 hover:bg-purple-700 active:scale-95 transition-all uppercase tracking-widest text-xs">{actionLocks.addGuest ? "WAIT..." : "Generate Pass"}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MenuPage;