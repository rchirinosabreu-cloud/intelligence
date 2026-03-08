const fs = require('fs');
const path = require('path');

const dir = 'src/components/modules/Minutes';

const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx'));

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Reset Containers (remove glassmorphism bg-background/50 dark:bg-zinc-900/50 backdrop-blur-xl border-border/50 shadow-xl)
  // Revert strictly to bg-card (or bg-white dark:bg-zinc-900) and shadow-sm

  content = content.replace(/bg-background\/[0-9]+/g, 'bg-card');
  content = content.replace(/bg-white dark:bg-zinc-900 bg-opacity-[0-9]+/g, 'bg-card');
  content = content.replace(/dark:bg-zinc-900\/[0-9]+/g, '');
  content = content.replace(/backdrop-blur-xl/g, '');
  content = content.replace(/shadow-xl/g, 'shadow-sm');
  content = content.replace(/shadow-lg/g, 'shadow-sm');
  content = content.replace(/shadow-primary\/[0-9]+/g, '');
  content = content.replace(/shadow-indigo-[0-9]+\/[0-9]+/g, '');
  content = content.replace(/shadow-purple-[0-9]+\/[0-9]+/g, '');
  content = content.replace(/border-border\/50/g, 'border-border');

  // Reset inner cards back to simple borders
  content = content.replace(/bg-primary\/20/g, 'bg-muted/50');
  content = content.replace(/bg-primary\/10/g, 'bg-muted/50');

  // Specific buttons like the Generate HTML or the Play button
  // Strip bg-gradient completely
  content = content.replace(/bg-gradient-to-r from-[a-z]+-[0-9]+ to-[a-z]+-[0-9]+/g, 'bg-primary');
  content = content.replace(/hover:from-[a-z]+-[0-9]+ hover:to-[a-z]+-[0-9]+/g, 'hover:bg-primary/90');

  content = content.replace(/w-full bg-primary text-primary-foreground hover:bg-primary\/90 h-12 shadow-sm /g, 'w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium h-12 shadow-sm');
  content = content.replace(/className="w-full bg-primary text-primary-foreground hover:bg-primary\/90"/g, 'className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium"');

  // Also clean the specific buttons inside Generate summary (html / pdf)
  content = content.replace(/bg-purple-[0-9]+\/50 hover:bg-purple-[0-9]+\/50 text-purple-[0-9]+ border border-purple-[0-9]+\/30/g, 'bg-muted hover:bg-muted/80 text-foreground border border-border');
  content = content.replace(/bg-indigo-[0-9]+\/50 hover:bg-indigo-[0-9]+\/50 text-indigo-[0-9]+ border border-indigo-[0-9]+\/30/g, 'bg-muted hover:bg-muted/80 text-foreground border border-border');

  fs.writeFileSync(filePath, content);
});

console.log("Containers and Buttons Refactored");
