// apps/web/src/routes/AppRoutes.tsx
import { Routes, Route } from "react-router-dom";
import Feed from "../pages/Feed";
import Ranking from "../pages/Ranking";
import Challenges from "../pages/Challenges";
import Recommendations from "../pages/Recommendations";
import AddVideo from "../pages/AddVideo";
import Login from "../pages/Login";
import Register from "../pages/Register";
import UserProfile from "../pages/UserProfile";
import NotFound from "../pages/NotFound";

import Profile from "../pages/Profile";
import ProtectedRoute from "./ProtectedRoute";

// новые страницы
import Forgot from "../pages/ForgotPassword";
import Reset from "../pages/ResetPassword";

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public pages */}
      <Route path="/" element={<Feed />} />

      <Route path="/feed" element={<Feed />} />

      <Route path="/ranking" element={<Ranking />} />
      <Route path="/challenges" element={<Challenges />} />
      <Route path="/recommendations" element={<Recommendations />} />

      {/* Auth pages */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Forgot / Reset password */}
      <Route path="/forgot" element={<Forgot />} />
      <Route path="/reset" element={<Reset />} />

      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>
        <Route path="/profile" element={<Profile />} />
        {/* профиль любого пользователя по id */}
        <Route path="/users/:userId" element={<UserProfile />} />
        <Route path="/add-video" element={<AddVideo />} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
