import React from 'react';
import DOMPurify from 'isomorphic-dompurify';
import { linkify } from '@/utils/chatUtils.jsx';

/**
 * Checks if the content string looks like it contains rich text HTML tags.
 */
const hasRichHTML = (text) => {
    if (!text) return false;
    // Look for any of the supported tags
    const richTagsRegex = /<(p|strong|em|u|h1|h2|ul|ol|li|br|a|span)(\s|>)/i;
    return richTagsRegex.test(text);
};

export const RichCommentContent = ({ content, contextData = {}, onImageClick }) => {
    if (!content) return null;

    const isRich = hasRichHTML(content);

    if (!isRich) {
        // Legacy/historical plain text rendering.
        // Falls back to safe text + linkify parser for S3 files, images, links, and @mentions.
        return (
            <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-200">
                {linkify(content, onImageClick, contextData)}
            </div>
        );
    }

    // Client-side HTML sanitization with isomorphic-dompurify
    const cleanHTML = DOMPurify.sanitize(content, {
        ALLOWED_TAGS: ['p', 'strong', 'em', 'u', 'h1', 'h2', 'ul', 'ol', 'li', 'br', 'span', 'a'],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style', 'data-type', 'data-id', 'data-label', 'data-mention-id'],
        ADD_ATTR: ['target', 'rel'],
        FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
    });

    // We can intercept <a> tags inside cleanHTML to open in target="_blank"
    // (DOMPurify with ADD_ATTR: ['target', 'rel'] already adds target="_blank" and rel="noopener noreferrer")

    return (
        <div
            className="text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-200 break-words
                       [&_p]:my-1.5 [&_p]:min-h-[1em]
                       [&_strong]:font-black
                       [&_em]:italic
                       [&_u]:underline
                       [&_h1]:text-lg [&_h1]:font-extrabold [&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:text-zinc-900 [&_h1]:dark:text-zinc-50
                       [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-2.5 [&_h2]:mb-1 [&_h2]:text-zinc-800 [&_h2]:dark:text-zinc-100
                       [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2
                       [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2
                       [&_li]:my-0.5
                       [&_a]:text-primary [&_a]:underline [&_a]:font-bold [&_a]:hover:text-primary/80
                       [&_span[data-type=mention]]:inline-block [&_span[data-type=mention]]:px-2 [&_span[data-type=mention]]:py-0.5 [&_span[data-type=mention]]:mx-0.5 [&_span[data-type=mention]]:bg-indigo-500/10 [&_span[data-type=mention]]:dark:bg-indigo-500/20 [&_span[data-type=mention]]:text-indigo-600 [&_span[data-type=mention]]:dark:text-indigo-300 [&_span[data-type=mention]]:rounded-full [&_span[data-type=mention]]:font-bold [&_span[data-type=mention]]:text-xs [&_span[data-type=mention]]:select-all [&_span[data-type=mention]]:shadow-sm"
            dangerouslySetInnerHTML={{ __html: cleanHTML }}
        />
    );
};

export default RichCommentContent;
