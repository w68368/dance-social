// apps/web/src/routes/AppRoutes.tsx
import { Routes, Route } from "react-router-dom";

// public pages
import Feed from "../pages/Feed";
import Ranking from "../pages/Ranking";
import Challenges from "../pages/Challenges";
import Recommendations from "../pages/Recommendations";

// auth pages
import Login from "../pages/Login";
import Register from "../pages/Register";
import Forgot from "../pages/ForgotPassword";
import Reset from "../pages/ResetPassword";

// protected pages
import Profile from "../pages/Profile";
import UserProfile from "../pages/UserProfile";
import AddVideo from "../pages/AddVideo";
import Settings from "../pages/Settings";

// system
import NotFound from "../pages/NotFound";
import ProtectedRoute from "./ProtectedRoute";

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Feed />} />
      <Route path="/feed" element={<Feed />} />
      <Route path="/ranking" element={<Ranking />} />
      <Route path="/challenges" element={<Challenges />} />
      <Route path="/recommendations" element={<Recommendations />} />

      {/* Auth routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot" element={<Forgot />} />
      <Route path="/reset" element={<Reset />} />

      {/* Protected routes (login required) */}
      <Route element={<ProtectedRoute />}>
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/add-video" element={<AddVideo />} />
        {/* profile of any user by id */}
        <Route path="/users/:userId" element={<UserProfile />} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
