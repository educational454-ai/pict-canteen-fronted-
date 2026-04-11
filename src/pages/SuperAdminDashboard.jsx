import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { Globe, TrendingUp, Activity, ShieldAlert, LogOut, Download, Building2, AlertTriangle, RotateCcw, X, Lock, Loader2 } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const SuperAdminDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('superAdminTab') || 'overview');
  const [orders, setOrders] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Reset Modal States
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState('');

  // Super Admin Details
  const adminName = sessionStorage.getItem('userName') || 'College Admin';

  useEffect(() => {
    fetchAllData();
  }, []);

  // Remember the active tab when it changes
  useEffect(() => {
    sessionStorage.setItem('superAdminTab', activeTab);
  }, [activeTab]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [ordersRes, deptsRes] = await Promise.all([
        API.get('/orders/all'),
        API.get('/departments/all')
      ]);
      if (Array.isArray(ordersRes.data)) setOrders(ordersRes.data);
      if (Array.isArray(deptsRes.data)) setDepartments(deptsRes.data);
    } catch (err) {
      console.error("Error fetching global data:", err);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // GLOBAL ANALYTICS & LEADERBOARD LOGIC
  // ==========================================
  const totalCollegeRevenue = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
  const totalGlobalOrders = orders.length;

  const deptAnalytics = {};

  // 🚀 THE FIX: 1. Pre-fill the leaderboard with ALL departments starting at ₹0
  departments.forEach(dept => {
      deptAnalytics[dept.name] = { name: dept.name, revenue: 0, orderCount: 0 };
  });

  // 2. Add the actual order totals on top
  orders.forEach(order => {
      const deptName = order.departmentId?.name || 'Unknown Department';
      
      // Just in case an order belongs to a deleted department, we still track it
      if (!deptAnalytics[deptName]) {
          deptAnalytics[deptName] = { name: deptName, revenue: 0, orderCount: 0 };
      }
      
      deptAnalytics[deptName].revenue += (order.totalAmount || 0);
      deptAnalytics[deptName].orderCount += 1;
  });

  const leaderboard = Object.values(deptAnalytics).sort((a, b) => b.revenue - a.revenue);

  // Prevent divide-by-zero errors in the UI if NO ONE has ordered anything yet
  const maxRevenue = leaderboard.length > 0 && leaderboard[0].revenue > 0 ? leaderboard[0].revenue : 1;

  const recentTransactions = [...orders]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10);

  // ==========================================
  // GLOBAL REPORT GENERATION
  // ==========================================
  const downloadGlobalReport = () => {
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
        doc.text("Office of the Principal - Global Accounting", 42, 24);

        doc.rect(50, 30, 110, 8);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("COLLEGE-WIDE CANTEEN REVENUE REPORT", 54, 36);

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        const dateStr = new Date().toLocaleDateString('en-GB');
        doc.text(`Report Generated On: ${dateStr}`, 14, 50);
        doc.text(`Total College Revenue: Rs. ${totalCollegeRevenue}/-`, 140, 50);

        let currentY = 65;
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("DEPARTMENT REVENUE LEADERBOARD", 14, currentY);

        const tableData = leaderboard.map((dept, index) => [
            index + 1, dept.name, dept.orderCount, `Rs. ${dept.revenue}`
        ]);

        autoTable(doc, {
          startY: currentY + 5,
          head: [['Rank', 'Department', 'Total Orders', 'Total Revenue (Rs)']],
          body: tableData.length ? tableData : [['-', 'No Data Available', '-', '-']],
          theme: 'grid',
          headStyles: { fillColor: [15, 32, 64] }, 
          bodyStyles: { fillColor: false },
          alternateRowStyles: { fillColor: false },
          styles: { fontSize: 10, cellPadding: 4 },
          columnStyles: { 0: { halign: 'center', cellWidth: 15 }, 2: { halign: 'center' }, 3: { halign: 'right', cellWidth: 35, fontStyle: 'bold' } }
        });

        currentY = doc.lastAutoTable.finalY + 20;

        doc.rect(130, currentY, 66, 12);
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text(`NET REVENUE`, 135, currentY + 8);
        doc.text(`Rs. ${totalCollegeRevenue}`, 170, currentY + 8);

        const pageHeight = doc.internal.pageSize.getHeight();
        doc.setFontSize(10);
        
        doc.line(20, pageHeight - 30, 70, pageHeight - 30);
        doc.text("CHIEF FINANCIAL OFFICER", 22, pageHeight - 24);
        
        doc.line(140, pageHeight - 30, 190, pageHeight - 30);
        doc.text("PRINCIPAL / CEO", 148, pageHeight - 24);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.text("STRICTLY CONFIDENTIAL | SYSTEM GENERATED GLOBAL AUDIT", 65, pageHeight - 10);

        doc.save(`PICT_Global_Revenue_${dateStr.replace(/\//g, '-')}.pdf`);
      };

      img.onerror = () => alert("Watermark image not found.");
  };

  const executeGlobalReset = async (e) => {
      e.preventDefault();
      setResetError('');
      
      if (!adminPassword || adminPassword.length < 4) {
          setResetError("Please enter a valid administrator password.");
          return;
      }

      setIsResetting(true);

      try {
          // 🚀 REAL BACKEND CONNECTION: Verifies password & wipes data!
          await API.post('/users/global-reset', { password: adminPassword });
          
          alert("System Reset Protocol Successfully Executed. All college data has been archived and cleared.");
          setIsResetModalOpen(false);
          setAdminPassword('');
          
          // Refresh the dashboard to show 0 for everything!
          fetchAllData(); 
      } catch (err) {
          // If the backend sends back a 401 Unauthorized, display the error in the red box
          setResetError(err.response?.data?.error || "Authentication failed. Incorrect password.");
      } finally {
          setIsResetting(false);
      }
  };

  if (loading) {
      return <div className="min-h-screen flex items-center justify-center bg-[#f8f9fc]"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900"></div></div>;
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#f8f9fc] relative font-sans h-screen overflow-hidden">
      <div className="w-64 bg-[#0a1128] text-white flex flex-col shadow-2xl z-10 shrink-0 hidden md:flex">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-2 mb-6">
              <ShieldAlert className="text-yellow-400" size={24} />
              <h2 className="text-lg font-black tracking-wider text-white">SUPER ADMIN</h2>
          </div>
          
          <div className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 p-3 rounded-xl border border-yellow-500/30 flex items-center gap-3 shadow-inner">
              <div className="w-10 h-10 rounded-full bg-yellow-500 flex items-center justify-center text-lg font-black text-black shrink-0">
                  {adminName.charAt(0).toUpperCase()}
              </div>
              <div className="overflow-hidden">
                  <p className="text-sm font-bold text-white truncate" title={adminName}>{adminName}</p>
                  <p className="text-[9px] font-black text-yellow-400 uppercase tracking-widest truncate">Global Access</p>
              </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2 mt-2">
          <button onClick={() => setActiveTab('overview')} className={`w-full flex items-center gap-3 p-3 rounded-xl font-bold transition-all ${activeTab === 'overview' ? 'bg-yellow-500/20 text-yellow-400 shadow-inner-sm' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
            <Globe size={20} /> Global Overview
          </button>
          <button onClick={() => setActiveTab('departments')}className={`w-full flex items-center gap-3 p-3 rounded-xl font-bold transition-all ${activeTab === 'departments' ? 'bg-yellow-500/20 text-yellow-400 shadow-inner-sm' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
            <Building2 size={20} /> Dept Leaderboard
          </button>
          <button onClick={() => setActiveTab('security')} className={`w-full flex items-center gap-3 p-3 rounded-xl font-bold transition-all ${activeTab === 'security' ? 'bg-red-500/20 text-red-400 shadow-inner-sm' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
            <AlertTriangle size={20} /> Security & Reset
          </button>
        </nav>
        <button onClick={() => { sessionStorage.clear(); navigate('/'); }} className="p-6 text-gray-400 hover:text-white flex items-center gap-3 border-t border-white/10 transition-colors">
          <LogOut size={20} /> Logout
        </button>
      </div>

      <div className="md:hidden bg-[#0a1128] text-white p-4 flex justify-between items-center z-20 shrink-0 shadow-md">
         <div className="flex items-center gap-2">
             <ShieldAlert className="text-yellow-400" size={20} />
             <h2 className="text-base font-black tracking-wider text-white">SUPER ADMIN</h2>
         </div>
         <div className="flex gap-3 items-center">
             <select className="bg-white/10 text-white border border-white/20 rounded-md text-xs p-1.5 outline-none font-bold" value={activeTab} onChange={(e) => setActiveTab(e.target.value)}>
                 <option value="overview" className="text-slate-800">Global Overview</option>
                 <option value="departments" className="text-slate-800">Leaderboard</option>
                 <option value="security" className="text-slate-800">Security</option>
             </select>
             <button onClick={() => { sessionStorage.clear(); navigate('/'); }} className="text-red-400 hover:text-red-300"><LogOut size={18} /></button>
         </div>
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="bg-white p-4 md:px-8 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm z-10 shrink-0">
            <div>
                <h1 className="text-xl md:text-2xl font-black text-gray-800 uppercase tracking-tight">College Dashboard</h1>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5">Live Accounting & Monitoring</p>
            </div>
            {activeTab !== 'security' && (
                <button onClick={downloadGlobalReport} className="w-full sm:w-auto justify-center px-5 py-2.5 bg-yellow-500 text-black rounded-xl text-sm font-black flex items-center gap-2 hover:bg-yellow-400 transition-all shadow-lg shadow-yellow-500/30">
                    <Download size={18} /> Global PDF Report
                </button>
            )}
        </header>

        <main className="flex-1 flex flex-col p-4 md:p-8 gap-4 md:gap-6 overflow-hidden bg-[#f0f2f5]">
            
            {activeTab === 'overview' && (
                <>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 shrink-0">
                        <div className="bg-gradient-to-br from-blue-900 to-[#0a1128] p-6 rounded-2xl shadow-xl text-white relative overflow-hidden">
                            <div className="relative z-10">
                                <p className="text-[11px] font-bold text-blue-300 uppercase tracking-widest mb-1">Total College Revenue</p>
                                <h3 className="text-4xl font-black tracking-tight">₹{totalCollegeRevenue.toLocaleString()}</h3>
                            </div>
                            <TrendingUp className="absolute -right-4 -bottom-4 text-white/10 w-32 h-32" />
                        </div>
                        <div className="bg-white p-6 rounded-2xl border shadow-sm border-l-4 border-l-purple-500 flex flex-col justify-center">
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2"><Activity size={14} className="text-purple-500"/> Global Transactions</p>
                            <h3 className="text-3xl font-black text-gray-800">{totalGlobalOrders}</h3>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border shadow-sm border-l-4 border-l-emerald-500 flex flex-col justify-center">
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2"><Building2 size={14} className="text-emerald-500"/> Active Departments</p>
                            <h3 className="text-3xl font-black text-gray-800">{departments.length}</h3>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border shadow-sm flex-1 overflow-hidden flex flex-col">
                        <div className="p-5 border-b border-gray-100 flex items-center gap-2 shrink-0">
                            <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span>
                            <h3 className="font-black text-gray-800 tracking-tight">Live Global Feed</h3>
                        </div>
                        <div className="overflow-y-auto overflow-x-auto flex-1 relative">
                            <table className="w-full text-left border-collapse min-w-[700px]">
                                <thead className="bg-gray-50/95 backdrop-blur-sm text-[10px] font-bold text-gray-400 uppercase tracking-widest sticky top-0 z-10 border-b border-gray-100">
                                    <tr>
                                        <th className="p-4 pl-6 md:pl-8">Time</th>
                                        <th className="p-4">Department</th>
                                        <th className="p-4">Person</th>
                                        <th className="p-4">Order Details</th>
                                        <th className="p-4 text-right pr-6 md:pr-8">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 text-sm">
                                    {recentTransactions.map((order, i) => (
                                        <tr key={i} className="hover:bg-gray-50/50 transition-all">
                                            <td className="p-4 pl-6 md:pl-8 text-xs font-bold text-gray-500">{new Date(order.createdAt || order.orderDate).toLocaleString('en-GB', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})}</td>
                                            <td className="p-4"><span className="bg-slate-100 text-slate-700 font-bold px-2 py-1 rounded text-[10px] uppercase tracking-wider border border-slate-200">{order.departmentId?.name || 'UNKNOWN'}</span></td>
                                            <td className="p-4 font-bold text-gray-800">{order.facultyId?.fullName || <span className="text-gray-400 italic">Guest / Walk-in</span>}</td>
                                            <td className="p-4 text-xs text-gray-500 truncate max-w-[200px]">{order.items.map(item => item.itemName).join(', ')}</td>
                                            <td className="p-4 pr-6 md:pr-8 text-right font-black text-green-600">₹{order.totalAmount}</td>
                                        </tr>
                                    ))}
                                    {recentTransactions.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-gray-400">No transactions recorded globally today.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {activeTab === 'departments' && (
                <div className="bg-white rounded-2xl border shadow-sm flex-1 overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-gray-100 shrink-0 bg-gradient-to-r from-slate-50 to-white">
                        <h3 className="font-black text-xl text-gray-800 tracking-tight">Department Leaderboard</h3>
                        <p className="text-xs font-semibold text-gray-500 mt-1">Ranking of highest spending departments across the campus.</p>
                    </div>
                    <div className="overflow-y-auto flex-1 p-6">
                        <div className="space-y-4">
                            {leaderboard.length === 0 ? (
                                <p className="text-center text-gray-400 py-10">No revenue data available yet.</p>
                            ) : (
                                leaderboard.map((dept, index) => (
                                    <div key={index} className="flex items-center p-4 border border-gray-100 rounded-xl hover:border-blue-200 hover:shadow-md transition-all bg-white relative overflow-hidden group">
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-lg shrink-0 mr-4 z-10 ${index === 0 && dept.revenue > 0 ? 'bg-yellow-100 text-yellow-600 shadow-inner' : index === 1 && dept.revenue > 0 ? 'bg-gray-100 text-gray-500 shadow-inner' : index === 2 && dept.revenue > 0 ? 'bg-orange-100 text-orange-600 shadow-inner' : 'bg-slate-50 text-slate-400'}`}>
                                            #{index + 1}
                                        </div>
                                        <div className="flex-1 z-10">
                                            <h4 className="text-lg font-black text-gray-800 tracking-tight">{dept.name}</h4>
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-0.5">{dept.orderCount} Transactions Processed</p>
                                        </div>
                                        <div className="text-right z-10">
                                            <p className="text-2xl font-black text-blue-600">₹{dept.revenue.toLocaleString()}</p>
                                        </div>
                                        <div className="absolute left-0 top-0 bottom-0 bg-blue-50/50 -z-0 transition-all duration-1000 ease-out" style={{ width: `${(dept.revenue / maxRevenue) * 100}%` }}></div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'security' && (
                <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-8 max-w-3xl mx-auto w-full">
                    <div className="flex items-center gap-4 mb-6 border-b border-gray-100 pb-6">
                        <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center border border-red-100">
                            <AlertTriangle className="text-red-500" size={32} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-red-600 tracking-tight">Danger Zone</h2>
                            <p className="text-sm font-semibold text-gray-500 mt-1">Highly destructive actions for system administrators only.</p>
                        </div>
                    </div>

                    <div className="border border-red-200 bg-red-50/30 rounded-xl p-6 relative overflow-hidden">
                        <h3 className="text-lg font-bold text-gray-800 mb-2">Academic Year Reset</h3>
                        <p className="text-sm text-gray-600 mb-6">Initiating this protocol will permanently delete all Faculty Vouchers, Guest Passes, and Order Logs across every department. This action cannot be undone. You should download the Global PDF Report before executing this.</p>
                        
                        <button onClick={() => setIsResetModalOpen(true)} className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-black rounded-lg shadow-lg shadow-red-200 transition-all flex items-center gap-2">
                            <RotateCcw size={18} /> INITIATE COLLEGE-WIDE RESET
                        </button>
                    </div>
                </div>
            )}
        </main>
      </div>

      {/* RESET CONFIRMATION MODAL */}
      {isResetModalOpen && (
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex justify-center items-center z-50 px-4">
              <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl border-4 border-red-500 animate-in fade-in zoom-in duration-200">
                  <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center gap-3 text-red-600">
                          <div className="p-2 bg-red-100 rounded-lg">
                              <AlertTriangle size={24} />
                          </div>
                          <h2 className="text-xl font-black tracking-tight">Verify Identity</h2>
                      </div>
                      <button onClick={() => { setIsResetModalOpen(false); setResetError(''); setAdminPassword(''); }} className="text-slate-400 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 p-2 rounded-md transition-colors"><X size={18}/></button>
                  </div>
                  
                  <p className="text-sm text-slate-600 mb-6 font-medium leading-relaxed">
                      This action is <span className="text-red-600 font-bold">irreversible</span>. Please enter your Super Admin password to confirm the permanent deletion of all college records.
                  </p>
                  
                  <form onSubmit={executeGlobalReset} className="space-y-4">
                      <div>
                          <div className="relative">
                              <Lock className="absolute left-4 top-3.5 text-slate-400" size={20} />
                              <input 
                                  type="password" 
                                  required 
                                  placeholder="Enter Admin Password" 
                                  value={adminPassword} 
                                  onChange={(e) => { setAdminPassword(e.target.value); setResetError(''); }} 
                                  className="w-full pl-12 pr-4 py-3.5 border-2 border-slate-200 rounded-xl outline-none focus:border-red-500 transition-all font-medium text-slate-800 placeholder:text-slate-400"
                              />
                          </div>
                          {resetError && <p className="text-xs font-bold text-red-500 mt-2 bg-red-50 p-2 rounded-md">{resetError}</p>}
                      </div>
                      
                      <div className="flex gap-3 mt-8">
                          <button type="button" onClick={() => { setIsResetModalOpen(false); setResetError(''); setAdminPassword(''); }} className="flex-1 py-3 border-2 border-slate-200 font-bold text-slate-600 rounded-xl hover:bg-slate-50 transition-all">Cancel</button>
                          <button type="submit" disabled={isResetting || !adminPassword} className="flex-1 py-3 bg-red-600 text-white font-black rounded-xl shadow-lg shadow-red-200 hover:bg-red-700 transition-all disabled:opacity-50 flex justify-center items-center gap-2">
                              {isResetting ? <Loader2 size={18} className="animate-spin" /> : "Permanently Reset"}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};

export default SuperAdminDashboard;