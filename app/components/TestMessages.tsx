"use client";

import React from 'react';
import { Message } from '../../src/types/message';

interface TestMessagesProps {
  onGenerateMessages: (messages: Message[]) => void;
}

const TestMessages: React.FC<TestMessagesProps> = ({ onGenerateMessages }) => {
  const generateTestMessages = () => {
    const testMessages: Message[] = [];
    for (let i = 1; i <= 100; i++) {
      testMessages.push({
        sender: i % 2 === 0 ? "User" : "TestBot",
        text: `This is test message #${i}. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.`
      });
    }
    onGenerateMessages(testMessages);
  };

  return (
    <div style={{ padding: '10px', background: '#f0f0f0', margin: '10px', borderRadius: '5px' }}>
      <button onClick={generateTestMessages} style={{ padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '5px' }}>
        Generate 100 Test Messages
      </button>
    </div>
  );
};

export default TestMessages;
