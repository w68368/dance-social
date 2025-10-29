import { NavLink, Outlet } from 'react-router-dom';

const linkStyle: React.CSSProperties = { marginRight: 12, textDecoration: 'none' };
const activeStyle: React.CSSProperties = { fontWeight: 700, textDecoration: 'underline' };

export default function App() {
  return (
    <div style={{fontFamily:'system-ui, Arial, sans-serif'}}>
      <header style={{padding:16, borderBottom:'1px solid #eee', display:'flex', gap:16}}>
        <NavLink to='/' style={({isActive}) => ({...linkStyle, ...(isActive?activeStyle:{})})}>Home</NavLink>
        <NavLink to='/feed' style={({isActive}) => ({...linkStyle, ...(isActive?activeStyle:{})})}>Feed</NavLink>
        <NavLink to='/teams' style={({isActive}) => ({...linkStyle, ...(isActive?activeStyle:{})})}>Teams</NavLink>
        <NavLink to='/challenges' style={({isActive}) => ({...linkStyle, ...(isActive?activeStyle:{})})}>Challenges</NavLink>
        <NavLink to='/profile/123' style={({isActive}) => ({...linkStyle, ...(isActive?activeStyle:{})})}>Profile(123)</NavLink>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
