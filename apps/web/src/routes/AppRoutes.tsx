import { Routes, Route } from "react-router-dom";
import Feed from "../pages/Feed";
import Ranking from "../pages/Ranking";
import Challenges from "../pages/Challenges";
import Recommendations from "../pages/Recommendations";
import AddVideo from "../pages/AddVideo";
import Login from "../pages/Login";
import Register from "../pages/Register";
import NotFound from "../pages/NotFound";

import Profile from "../pages/Profile";
import ProtectedRoute from "./ProtectedRoute";

export default function AppRoutes() {
  return (
    <Routes>
      {/* Публичные страницы */}
      <Route path="/" element={<Feed />} />
      <Route path="/ranking" element={<Ranking />} />
      <Route path="/challenges" element={<Challenges />} />
      <Route path="/recommendations" element={<Recommendations />} />
      <Route path="/add-video" element={<AddVideo />} />

      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>
        <Route path="/profile" element={<Profile />} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
