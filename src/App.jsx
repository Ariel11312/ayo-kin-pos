import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import POS from "./components/POS";
import LoginView from "./components/Views/LoginView";
import ProtectedRoute from "./components/ProtectedRoute";
import EmployeeClockPage from "./components/EmployeePhoneClock";
import RiderScannerPage from "./components/Views/RiderScanView";

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginView />} />

        <Route
          path="/pos"
          element={
            <ProtectedRoute allowedRoles={["staff", "admin"]}>
              <POS />
            </ProtectedRoute>
          }
        />

        <Route
          path="/rider"
          element={
            <ProtectedRoute allowedRoles={["rider", "admin"]}>
              <RiderScannerPage />
            </ProtectedRoute>
          }
        />

        <Route path="/clock" element={<EmployeeClockPage />} />

        {/* kahit anong maling URL -> login (na magre-redirect ayon sa role) */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;