import { Link } from "react-router-dom";

export default function Logo() {
  return (
    <Link to="/" className="logo">
      <span className="logo-step">Step</span>
      <span className="logo-unity">Unity</span>
    </Link>
  );
}
