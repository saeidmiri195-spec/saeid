import { Chat } from "@google/genai";
import React from "react";
import { CncIcon, DocumentIcon, DoubleGlazingIcon, DoubleSidedTapeIcon, GlazingIcon, ShokuritIcon } from "./components/icons";

export enum Role {
    USER = 'user',
    BOT = 'bot',
}

export interface Message {
    role: Role;
    text: string;
}

export type ChatboxId = 'shokurit' | 'doubleSidedTape' | 'glazing' | 'cnc' | 'doubleGlazing';

export const CHATBOX_CONFIG: Record<ChatboxId, { name: string, icon: React.FC<any> }> = {
    shokurit: { name: 'شکوریت', icon: ShokuritIcon },
    doubleSidedTape: { name: 'چسب دو جداره', icon: DoubleSidedTapeIcon },
    glazing: { name: 'طلق گذاری', icon: GlazingIcon },
    cnc: { name: 'سی ان سی', icon: CncIcon },
    doubleGlazing: { name: 'دوجداره', icon: DoubleGlazingIcon },
};

export interface ChatboxState {
    pdfText: string | null;
    pdfName: string;
    chat: Chat | null;
    messages: Message[];
    pdfObjectUrls: Record<string, string>; // Maps original filename to its object URL for viewing
}