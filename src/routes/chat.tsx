import { createFileRoute } from '@tanstack/react-router';
import { ChatContainer } from '@/components/chat/chat-container';

function ChatPage() {
  return <ChatContainer />;
}

export const Route = createFileRoute('/chat')({
  component: ChatPage,
});
