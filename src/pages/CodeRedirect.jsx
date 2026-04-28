import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const CodeRedirect = () => {
  const { voucher } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!voucher) {
      navigate('/', { replace: true });
      return;
    }

    const code = decodeURIComponent(voucher);
    // store for the MenuPage to pick up
    try { sessionStorage.setItem('userVoucher', code); } catch (e) { /* ignore */ }

    // try to copy to clipboard (mobile browsers may prompt)
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(() => {
        toast.success('Access code copied to clipboard — please click Login to use it');
      }).catch(() => {
        // silent fail
      });
    }

    // navigate to login page (do NOT auto-login) so examiners must press Login manually
    navigate('/', { replace: true });
  }, [voucher, navigate]);

  return null;
};

export default CodeRedirect;
