import React from 'react';
import { createRoot } from 'react-dom/client';
import CommercialRequestPage from '@/components/public/CommercialRequest/CommercialRequestPage';
import 'react-datepicker/dist/react-datepicker.css';
import '@/index.css';

if (new URLSearchParams(location.search).has('dark')) document.documentElement.classList.add('dark');
createRoot(document.getElementById('root')).render(<CommercialRequestPage />);
