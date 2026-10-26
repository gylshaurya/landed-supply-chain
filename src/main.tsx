import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import '@bryntum/gantt/gantt.css';
import '@bryntum/gantt/svalbard-light.css';
import '@bryntum/gantt/fontawesome/css/fontawesome.css';
import '@bryntum/gantt/fontawesome/css/solid.css';
import './styles.css';
import { AppProvider } from './lib/store';
import { Shell } from './components/Shell';
import { CommandCenter } from './pages/CommandCenter';
import { Timeline } from './pages/Timeline';
import { Runway } from './pages/Runway';
import { Preorders } from './pages/Preorders';
import { Payments } from './pages/Payments';
import { ProposalPage } from './pages/Proposal';
import { Intake } from './pages/Intake';
import { Outbox } from './pages/Outbox';
import { SupplierPortal } from './pages/SupplierPortal';
import { Store } from './pages/Store';
import { Notice } from './pages/Notice';
import { ResetDemo } from './pages/ResetDemo';
import { Toaster } from './components/Toast';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/reset" element={<ResetDemo />} />
          <Route path="/store" element={<Store />} />
          <Route path="/notice/:token" element={<Notice />} />
          <Route path="/portal/:poId" element={<SupplierPortal />} />
          <Route element={<Shell />}>
            <Route index element={<CommandCenter />} />
            <Route path="timeline" element={<Timeline />} />
            <Route path="runway" element={<Runway />} />
            <Route path="preorders" element={<Preorders />} />
            <Route path="payments" element={<Payments />} />
            <Route path="proposals/:id" element={<ProposalPage />} />
            <Route path="intake" element={<Intake />} />
            <Route path="outbox" element={<Outbox />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster />
    </AppProvider>
  </React.StrictMode>,
);
