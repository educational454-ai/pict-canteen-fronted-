import React from 'react';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-slate-200 py-4 text-center shrink-0 z-50">
      <p className="text-xs font-medium text-slate-500">
        &copy; {currentYear} SCTR's Pune Institute of Computer Technology. All Rights Reserved.
      </p>
    </footer>
  );
};

export default Footer;