import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import POSView from "./components/POSView"

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<POSView />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;