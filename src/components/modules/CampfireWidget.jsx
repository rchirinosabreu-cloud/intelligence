import React from 'react';
import ChatWidget from './ChatWidget';

const CampfireWidget = ({ clientId, externalOpen, onExternalOpenChange }) => {
    return (
        <ChatWidget
            title="Chat Campfire"
            description="Chat operativo exclusivo para este cliente"
            apiEndpoint={`/api/clients/${clientId}/campfire`}
            isGlobal={false}
            clientId={clientId}
            externalOpen={externalOpen}
            onExternalOpenChange={onExternalOpenChange}
        />
    );
};

export default CampfireWidget;
