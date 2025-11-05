import { Navigate, Outlet } from "react-router-dom";
import { getUser } from "../lib/auth";

export default function ProtectedRoute() {
  const user = getUser();
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
