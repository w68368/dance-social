import { NavLink } from "react-router-dom";

type Props = { to: string; children: React.ReactNode; exact?: boolean };

export default function NavItem({ to, children }: Props) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        "nav-link" + (isActive ? " nav-link--active" : "")
      }
      end
    >
      {children}
      <span className="nav-underline" />
    </NavLink>
  );
}
