import { useParams } from 'react-router-dom';
export default function Profile() {
  const { id } = useParams();
  return <div style={{padding:16}}>Профиль танцора: {id}</div>;
}
