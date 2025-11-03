import { BrowserRouter } from "react-router-dom";
import Header from "./components/Header";
import AppRoutes from "./routes/AppRoutes";
import "./App.css";

export default function App() {
  return (
    <BrowserRouter>
      <Header />
      <div className="container">
        <AppRoutes />
      </div>
    </BrowserRouter>
  );
}
