
import React, { useState, useCallback, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Message, Role, ChatboxId, ChatboxState, CHATBOX_CONFIG } from './types';
import { extractTextFromPdf } from './utils/pdfUtils';
import { getApiKey } from './utils/apiKey';
import HomePage from './components/HomePage';
import ChatPage from './components/ChatPage';
import PdfViewer from './components/PdfViewer';

const App: React.FC = () => {
    const [selectedChatbox, setSelectedChatbox] = useState<ChatboxId | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [viewingPdf, setViewingPdf] = useState<{ url: string; page: number; fileName: string; highlightText: string; } | null>(null);

    const [chatboxes, setChatboxes] = useState<Record<ChatboxId, ChatboxState>>(() => {
        const initial: Partial<Record<ChatboxId, ChatboxState>> = {};
        for (const id in CHATBOX_CONFIG) {
            initial[id as ChatboxId] = {
                pdfText: null,
                pdfName: '',
                chat: null,
                messages: [],
                pdfObjectUrls: {},
            };
        }
        return initial as Record<ChatboxId, ChatboxState>;
    });

    useEffect(() => {
        const hydratedState: Record<ChatboxId, ChatboxState> = { ...chatboxes };
        let hasHydrated = false;
        const apiKey = getApiKey();
        if (!apiKey) {
            setError("کلید API یافت نشد. لطفاً برنامه را به درستی پیکربندی کنید.");
            return;
        }

        Object.keys(CHATBOX_CONFIG).forEach(id => {
            const chatboxId = id as ChatboxId;
            try {
                const storedPdfText = localStorage.getItem(`pdf_text_${chatboxId}`);
                const storedFileNames = localStorage.getItem(`pdf_name_${chatboxId}`);

                if (storedPdfText && storedFileNames) {
                    const fileList = storedFileNames.split(', ');
                    const displayFileName = fileList.length > 1 ? `${fileList.length} فایل آپلود شد` : storedFileNames;

                    hydratedState[chatboxId].pdfText = storedPdfText;
                    hydratedState[chatboxId].pdfName = displayFileName;
                    
                    const ai = new GoogleGenAI({ apiKey });
                    const systemInstruction = `شما یک دستیار هوش مصنوعی متخصص و آموزنده برای موضوع "${CHATBOX_CONFIG[chatboxId].name}" هستید. وظیفه شما این است که به سوالات، فقط و فقط بر اساس محتوای اسناد ارائه شده پاسخ دهید.
**دستورالعمل‌های پاسخگویی:**
1.  **کامل و جامع:** پاسخ‌های خود را به صورت کامل، دقیق و با جزئیات فراوان ارائه دهید. مفاهیم را به زبانی ساده و قابل فهم توضیح دهید، گویی در حال آموزش به یک فرد مبتدی هستید.
2.  **ارجاع دقیق:** هنگامی که از اطلاعات یک سند استفاده می‌کنید، **باید** در انتهای جمله مربوطه، منبع را با فرمت دقیق زیر ذکر کنید: [منبع: نام فایل, صفحه: شماره صفحه, متن: "نقل قول دقیق از متن"]. نقل قول باید دقیقاً همان متنی باشد که از سند برای پاسخگویی استفاده کرده‌اید و به شما امکان می‌دهد تا متن مورد نظر را در سند هایلایت کنید.
3.  **صداقت:** اگر پاسخ سوالی در اسناد موجود نیست، به وضوح بگویید که اطلاعات مورد نظر در اسناد یافت نشد.
4.  **ساختارمند:** در صورت امکان، از لیست‌های شماره‌دار یا بولت‌پوینت برای سازماندهی بهتر پاسخ‌ها و افزایش خوانایی استفاده کنید.

کاربر فایل‌های زیر را آپلود کرده است: ${storedFileNames}.
متن اسناد:
---
${storedPdfText}
---
`;
                    const newChat = ai.chats.create({ model: 'gemini-2.5-flash', config: { systemInstruction } });
                    hydratedState[chatboxId].chat = newChat;
                    hydratedState[chatboxId].messages = [{ role: Role.BOT, text: `آماده پاسخگویی به سوالات در مورد "${displayFileName}" هستم. چگونه می‌توانم به شما کمک کنم؟` }];
                    hasHydrated = true;
                }
            } catch (e) { console.error(`Failed to hydrate state for ${chatboxId}`, e); }
        });
       if(hasHydrated) setChatboxes(hydratedState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    
    useEffect(() => {
        // Cleanup object URLs on component unmount
        return () => {
            Object.values(chatboxes).forEach((chatbox: ChatboxState) => {
                Object.values(chatbox.pdfObjectUrls).forEach((url: string) => URL.revokeObjectURL(url));
            });
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSelectChatbox = (id: ChatboxId) => setSelectedChatbox(id);
    const handleGoHome = () => setSelectedChatbox(null);

    const handlePdfUpload = useCallback(async (files: File[], chatboxId: ChatboxId) => {
        if (files.length === 0) return;
        setIsLoading(true);
        setError(null);
        
        const apiKey = getApiKey();
        if (!apiKey) {
            setError("کلید API یافت نشد. لطفاً برنامه را به درستی پیکربندی کنید.");
            setIsLoading(false);
            return;
        }

        try {
            const docsWithContent = await Promise.all(files.map(file => extractTextFromPdf(file)));
            
            const newObjectUrls = files.reduce((acc, file) => {
                acc[file.name] = URL.createObjectURL(file);
                return acc;
            }, {} as Record<string, string>);

            const combinedTextForPrompt = docsWithContent.map(doc => {
                const pageContents = doc.pageTexts.map(p => `صفحه ${p.page}:\n${p.text}`).join('\n---\n');
                return `شروع سند: ${doc.fileName}\n---\n${pageContents}\n---\nپایان سند: ${doc.fileName}`;
            }).join('\n\n');
            
            const fileNames = files.map(file => file.name).join(', ');
            const displayFileName = files.length > 1 ? `${files.length} فایل آپلود شد` : files[0].name;

            localStorage.setItem(`pdf_text_${chatboxId}`, combinedTextForPrompt);
            localStorage.setItem(`pdf_name_${chatboxId}`, fileNames);

            const ai = new GoogleGenAI({ apiKey });
            const systemInstruction = `شما یک دستیار هوش مصنوعی متخصص و آموزنده برای موضوع "${CHATBOX_CONFIG[chatboxId].name}" هستید. وظیفه شما این است که به سوالات، فقط و فقط بر اساس محتوای اسناد ارائه شده پاسخ دهید.
**دستورالعمل‌های پاسخگویی:**
1.  **کامل و جامع:** پاسخ‌های خود را به صورت کامل، دقیق و با جزئیات فراوان ارائه دهید. مفاهیم را به زبانی ساده و قابل فهم توضیح دهید، گویی در حال آموزش به یک فرد مبتدی هستید.
2.  **ارجاع دقیق:** هنگامی که از اطلاعات یک سند استفاده می‌کنید، **باید** در انتهای جمله مربوطه، منبع را با فرمت دقیق زیر ذکر کنید: [منبع: نام فایل, صفحه: شماره صفحه, متن: "نقل قول دقیق از متن"]. نقل قول باید دقیقاً همان متنی باشد که از سند برای پاسخگویی استفاده کرده‌اید و به شما امکان می‌دهد تا متن مورد نظر را در سند هایلایت کنید.
3.  **صداقت:** اگر پاسخ سوالی در اسناد موجود نیست، به وضوح بگویید که اطلاعات مورد نظر در اسناد یافت نشد.
4.  **ساختارمند:** در صورت امکان، از لیست‌های شماره‌دار یا بولت‌پوینت برای سازماندهی بهتر پاسخ‌ها و افزایش خوانایی استفاده کنید.

کاربر فایل‌های زیر را آپلود کرده است: ${fileNames}.
متن اسناد:
---
${combinedTextForPrompt}
---
`;
            const newChat = ai.chats.create({ model: 'gemini-2.5-flash', config: { systemInstruction } });

            setChatboxes(prev => ({
                ...prev,
                [chatboxId]: {
                    ...prev[chatboxId],
                    pdfText: combinedTextForPrompt,
                    pdfName: displayFileName,
                    chat: newChat,
                    messages: [{
                        role: Role.BOT,
                        text: `من ${files.length} سند را خواندم. هر سوالی در مورد ${CHATBOX_CONFIG[chatboxId].name} دارید بپرسید.`,
                    }],
                    pdfObjectUrls: newObjectUrls,
                }
            }));
        } catch (e) {
            console.error(e);
            setError('پردازش فایل‌های PDF با شکست مواجه شد. لطفاً دوباره تلاش کنید.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const handleSendMessage = useCallback(async (text: string, chatboxId: ChatboxId) => {
        const currentChatbox = chatboxes[chatboxId];
        if (!currentChatbox.chat) return;

        const userMessage: Message = { role: Role.USER, text };
        setChatboxes(prev => ({ ...prev, [chatboxId]: { ...prev[chatboxId], messages: [...prev[chatboxId].messages, userMessage] } }));
        setIsLoading(true);

        try {
            const response = await currentChatbox.chat.sendMessage({ message: text });
            const botMessage: Message = { role: Role.BOT, text: response.text };
            setChatboxes(prev => ({ ...prev, [chatboxId]: { ...prev[chatboxId], messages: [...prev[chatboxId].messages, botMessage] } }));
        } catch (e) {
            console.error(e);
            const errorMessage: Message = { role: Role.BOT, text: "متاسفم، با خطا مواجه شدم. لطفاً دوباره تلاش کنید." };
            setChatboxes(prev => ({ ...prev, [chatboxId]: { ...prev[chatboxId], messages: [...prev[chatboxId].messages, errorMessage] } }));
        } finally {
            setIsLoading(false);
        }
    }, [chatboxes]);
    
    const handleNewChat = (chatboxId: ChatboxId) => {
        localStorage.removeItem(`pdf_text_${chatboxId}`);
        localStorage.removeItem(`pdf_name_${chatboxId}`);
        
        const oldUrls = chatboxes[chatboxId].pdfObjectUrls;
        // Fix: Explicitly type `url` to resolve `unknown` type from Object.values.
        Object.values(oldUrls).forEach((url: string) => URL.revokeObjectURL(url));

        setChatboxes(prev => ({ ...prev, [chatboxId]: { pdfText: null, pdfName: '', chat: null, messages: [], pdfObjectUrls: {} } }));
        setError(null);
    };
    
    const handleCiteClick = (fileName: string, page: number, text: string) => {
        if (!selectedChatbox) return;
        const url = chatboxes[selectedChatbox].pdfObjectUrls[fileName];
        if (url) {
            setViewingPdf({ url, page, fileName, highlightText: text });
        }
    };

    const currentChatboxData = selectedChatbox ? chatboxes[selectedChatbox] : null;

    return (
        <div className="flex flex-col h-screen bg-gray-900 text-gray-100 font-sans">
            {!selectedChatbox ? (
                <HomePage onSelectChatbox={handleSelectChatbox} />
            ) : (
                <ChatPage 
                    chatboxId={selectedChatbox}
                    chatboxState={currentChatboxData!}
                    onUpload={(files) => handlePdfUpload(files, selectedChatbox)}
                    onSendMessage={(text) => handleSendMessage(text, selectedChatbox)}
                    onNewChat={() => handleNewChat(selectedChatbox)}
                    onGoHome={handleGoHome}
                    onCiteClick={handleCiteClick}
                    isLoading={isLoading}
                    error={error}
                />
            )}
            {viewingPdf && (
                <PdfViewer
                    fileUrl={viewingPdf.url}
                    pageNumber={viewingPdf.page}
                    fileName={viewingPdf.fileName}
                    highlightText={viewingPdf.highlightText}
                    onClose={() => setViewingPdf(null)}
                />
            )}
        </div>
    );
};

export default App;
