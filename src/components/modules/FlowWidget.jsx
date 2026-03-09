import React from 'react';
import ChatWidget from './ChatWidget';

const FlowWidget = ({ clientId, externalOpen, onExternalOpenChange }) => {
    return (
        <ChatWidget
            title="Chat Flow"
            description="Chat operativo exclusivo para este cliente"
            apiEndpoint={`/api/clients/${clientId}/flow`}
            isGlobal={false}
            clientId={clientId}
            externalOpen={externalOpen}
            onExternalOpenChange={onExternalOpenChange}
        />
    );
};

export default FlowWidget;
