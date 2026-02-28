import { ChatProvider } from '@/contexts/ChatContext';
import { ChatLayout } from '@/components/chat/ChatLayout';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const Index = () =>
{
  const navigate = useNavigate();
  useEffect(() =>
  {
    const token = localStorage.getItem("token")
    if (!token) {
      navigate("/login");
      return 
    }
  },[])
  


  return (
    <ChatProvider>
      <ChatLayout />
    </ChatProvider>
  );
};

export default Index;
