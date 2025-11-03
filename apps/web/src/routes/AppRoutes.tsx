import { Routes, Route } from "react-router-dom";
import Feed from "../pages/Feed";
import Ranking from "../pages/Ranking";
import Challenges from "../pages/Challenges";
import Recommendations from "../pages/Recommendations";
import AddVideo from "../pages/AddVideo";
import Login from "../pages/Login";
import Register from "../pages/Register";
import NotFound from "../pages/NotFound";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Feed />} />
      <Route path="/ranking" element={<Ranking />} />
      <Route path="/challenges" element={<Challenges />} />
      <Route path="/recommendations" element={<Recommendations />} />
      <Route path="/add-video" element={<AddVideo />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
