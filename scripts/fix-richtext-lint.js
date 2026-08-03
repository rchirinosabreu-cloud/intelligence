import fs from 'fs';
import path from 'path';

const file = path.join('src', 'components', 'ui', 'RichTextEditor.jsx');
if (fs.existsSync(file)) {
    console.log('[Lint Fix] Inspecting RichTextEditor.jsx for mismatched Popover.Root tag...');
    let content = fs.readFileSync(file, 'utf8');

    // Exact target pattern when corrupted by Git merge strategy
    const target = 'document.body\n      )}\n    </div>\n  );\n});';
    if (content.includes(target)) {
        console.log('[Lint Fix] Found mismatched closing tag! Replacing with </Popover.Root>...');
        content = content.replace(target, 'document.body\n      )}\n    </Popover.Root>\n  );\n});');
        fs.writeFileSync(file, content, 'utf8');
        console.log('[Lint Fix] RichTextEditor.jsx resolved.');
    } else {
        console.log('[Lint Fix] No mismatched tag found or already correct.');
    }
}
