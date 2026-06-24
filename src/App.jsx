import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import POS from "./components/POS"

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<POS />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;