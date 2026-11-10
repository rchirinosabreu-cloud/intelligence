import {ThemeProvider} from '../../src/context/ThemeContext';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {BrowserRouter} from 'react-router-dom';
import axios from 'axios';
import {Toaster} from 'react-hot-toast';
import {AuthProvider,useAuth} from '../../src/context/AuthContext';
import AppLayout from '../../src/components/layout/AppLayout';
import FinancialDashboard from '../../src/components/modules/FinancialDashboard';
import '../../src/index.css';
import 'react-datepicker/dist/react-datepicker.css';

const user={id:'demo-admin',name:'Rodny · revisión local',role:'ADMIN',financialRole:'ADMIN',hasFinancialAccess:true,modulePermissions:{financiero:true},isActive:true};
localStorage.setItem('authToken',`demo.${btoa(JSON.stringify({exp:4102444800}))}.demo`);
localStorage.setItem('currentUser',JSON.stringify(user));
// Only layout services are stubbed. Every financial read/write uses isolated PostgreSQL.
const nativeFetch=window.fetch.bind(window);
window.fetch=(url,options)=>{
 const path=new URL(url,location.origin).pathname;
 if(!path.startsWith('/api/'))return nativeFetch(url,options);
 let data=[];
 if(path.includes('/auth/')||path==='/api/user/profile')data=user;
 else if(path==='/api/user/onboarding')data={user,autoOnboarding:false,progress:{welcome:true,cotizaciones:true}};
 else if(path.includes('/notifications'))data={items:[],unreadCount:0};
 else if(path.includes('/important-notices'))data={notices:[]};
 else if(path==='/api/manager/decisions/pulse')data={keys:[]};
 return Promise.resolve(new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}}));
};
const request=axios.getAdapter('xhr');
axios.defaults.adapter=config=>{
 const url=new URL(config.url,location.origin);
 if(url.pathname.startsWith('/api/financials'))return request({...config,url:`${location.origin}/preview-api${url.pathname.slice('/api/financials'.length)}${url.search}`});
 return Promise.resolve({data:[],status:200,statusText:'OK',headers:{},config});
};
function Screen(){const {isLoading}=useAuth();return isLoading?null:<AppLayout><div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">LOCAL · copia de consulta de Francisco, Francys y Jesu. Las acciones de esta pantalla solo afectan la copia aislada.</div><FinancialDashboard/></AppLayout>;}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ThemeProvider><AuthProvider><BrowserRouter><Screen/><Toaster/></BrowserRouter></AuthProvider></ThemeProvider></QueryClientProvider>);
