import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import POS from "./components/POS";
import LoginView from './components/Views/LoginView';
import ProtectedRoute from './components/ProtectedRoute';
import EmployeeClockPage from "./components/EmployeePhoneClock";


const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginView />} />
        <Route
          path="/pos"
          element={
            <ProtectedRoute>
              <POS />
            </ProtectedRoute>
          }
        />
        <Route path="/clock" element={<EmployeeClockPage />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;