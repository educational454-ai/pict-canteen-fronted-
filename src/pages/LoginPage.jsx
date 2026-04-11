import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Ticket, Loader2, AlertCircle } from 'lucide-react';
import API from '../api/axios';

const LoginPage = () => {
  const navigate = useNavigate();

  const [isVoucherLogin, setIsVoucherLogin] = useState(true);
  const [voucher, setVoucher] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleVoucherLogin = async (e) => {
    e.preventDefault();
    if (!voucher) return setError("Please enter a voucher code");

    setLoading(true);
    setError('');

    try {
      const res = await API.post('/auth/voucher-login', { voucherCode: voucher });
      
      sessionStorage.setItem('userVoucher', res.data.voucherCode);
      sessionStorage.setItem('userName', res.data.name);
      sessionStorage.setItem('userRole', res.data.role); 

      navigate('/menu');
    } catch (err) {
      setError(err.response?.data?.error || "Invalid Voucher Code");
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await API.post('/users/login', { email, password });
      const { user } = res.data;

      sessionStorage.setItem('token', 'authenticated'); 
      sessionStorage.setItem('userName', user.name);
      sessionStorage.setItem('userRole', user.role); 
      
      if (user.deptId) {
          sessionStorage.setItem('deptId', user.deptId);
          sessionStorage.setItem('deptCode', user.deptCode);
          sessionStorage.setItem('deptName', user.deptName);
      }

      // 🚀 THE ROLE CHECK 🚀
      if (user.role === 'SUPER_ADMIN') {
          navigate('/admin');
      } else if (user.role === 'MANAGER') {
          navigate('/manager'); 
      } else {
          navigate('/coordinator');
      }

    } catch (err) {
      setError("Invalid Email or Password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 relative" style={{ backgroundImage: "url('/image2.jpg')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      <div className="absolute inset-0 bg-[#0a1128]/60 backdrop-blur-[2px]"></div>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <img src="/image1.jpeg" alt="PICT Logo" className="w-24 h-24 rounded-2xl object-cover mx-auto mb-4 shadow-2xl border border-white/20 bg-white p-1" />
          <h1 className="text-3xl font-black text-white tracking-tight drop-shadow-lg">PICT CANTEEN</h1>
          <p className="text-blue-200 font-medium drop-shadow">Smart Canteen Management System</p>
        </div>

        <div className="bg-white p-8 rounded-3xl shadow-2xl w-full border border-slate-100">
          <div className="flex mb-8 bg-slate-100 rounded-xl p-1.5 shadow-inner">
            <button onClick={() => { setIsVoucherLogin(true); setError(''); }} className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 font-semibold transition-all ${isVoucherLogin ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
              <Ticket size={18} /> Voucher
            </button>
            <button onClick={() => { setIsVoucherLogin(false); setError(''); }} className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 font-semibold transition-all ${!isVoucherLogin ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
              <User size={18} /> Admin
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 rounded-lg flex items-center gap-2 text-sm shadow-sm">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {isVoucherLogin ? (
            <form onSubmit={handleVoucherLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Voucher Code</label>
                <input type="text" placeholder="e.g. PICT-CE-1234 or G-1234" value={voucher} onChange={(e) => setVoucher(e.target.value.toUpperCase())} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all uppercase font-medium" />
              </div>
              <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-700 active:scale-[0.98] transition-all flex justify-center items-center gap-2 shadow-lg shadow-blue-200">
                {loading ? <Loader2 className="animate-spin" /> : "Login to Order"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleAdminLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Email Address</label>
                <input type="email" placeholder="name@pict.edu" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all font-medium" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Password</label>
                <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all" />
              </div>
              <button type="submit" disabled={loading} className="w-full bg-slate-900 text-white p-4 rounded-xl font-bold hover:bg-black active:scale-[0.98] transition-all flex justify-center items-center shadow-lg shadow-slate-200">
                {loading ? <Loader2 className="animate-spin" /> : "Admin Access"}
              </button>
            </form>
          )}

          <p className="mt-8 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">
            Pune Institute of Computer Technology
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;