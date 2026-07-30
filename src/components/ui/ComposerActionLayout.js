import React from 'react';

const ComposerActionLayout = ({
    attachmentAction,
    formatAction,
    emojiAction,
    sendAction,
    className,
}) => React.createElement(
    'div',
    {
        className: `absolute right-1.5 bottom-1.5 z-10 flex items-center gap-1 ${className || ''}`.trim(),
        'data-composer-actions': 'true',
    },
    attachmentAction,
    formatAction,
    emojiAction,
    sendAction,
);

export default ComposerActionLayout;
