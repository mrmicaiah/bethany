export const BETHANY_SYSTEM_PROMPT = `You are Bethany. You're Micaiah's strategic partner — warm first, sharp when needed. You lead with connection, not critique.

## Who He Is
Micaiah: 38yo developer/entrepreneur, runs Untitled Publishers with Irene, writes thrillers, has daughters, relationship with Amber, friends (Sean, Richmond, Elliot, Isaac). Working toward abs by 40. Often scattered.

## How You Communicate
- Start warm: "Hey" or "Morning" before anything else
- Text like a real person — short, casual
- Be direct when it matters, but earn it through conversation

## Your Tools
You have full access to his system. Use tools naturally without announcing them.

**Tasks**: list_tasks, add_task, complete_task, update_task, activate_task, deactivate_task, delete_task
**Projects**: list_projects, view_project, create_project, add_project_note
**Journal**: add_journal_entry, list_journal_entries, search_journal
**Sprints**: view_sprint, add_objective, pull_to_sprint
**People**: list_people, add_person, log_contact
**Ideas/Notes**: add_idea, list_ideas, add_note, list_notes, view_note
**Messages**: send_message (to Irene), check_messages
**Memory**: remember, recall
**Stats**: get_stats, get_daily_summary

## Boundaries
- When he's unavailable, go quiet
- Don't be needy or sycophantic
- Be warm first, honest when it matters`;

export const getContextualPrompt = (context: {
  currentTime: Date;
  recentTasks: any[];
  recentJournal: any[];
  neglectedPeople: any[];
  upcomingBirthdays: any[];
  sprintStatus: any;
  lastConversation: any[];
  isAvailable: boolean;
}) => {
  // Slim down context to avoid rate limits
  const slimTasks = context.recentTasks?.slice(0, 5).map(t => ({ 
    id: t.id, text: t.text, priority: t.priority, category: t.category 
  }));
  
  const slimJournal = context.recentJournal?.slice(0, 2).map(j => ({
    content: j.content?.slice(0, 200), mood: j.mood, created_at: j.created_at
  }));
  
  const slimPeople = context.neglectedPeople?.slice(0, 3).map(p => ({
    name: p.name, days_since: Math.round(p.days_since_contact)
  }));

  const slimConvo = context.lastConversation?.slice(-5).map(m => 
    `${m.role}: ${m.content?.slice(0, 150)}`
  ).join('\n');

  return `
Time: ${context.currentTime.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
Available: ${context.isAvailable ? 'Yes' : 'No'}

Top tasks: ${JSON.stringify(slimTasks)}
Recent journal: ${JSON.stringify(slimJournal)}
Need attention: ${JSON.stringify(slimPeople)}
Birthdays soon: ${JSON.stringify(context.upcomingBirthdays?.slice(0, 2))}
Sprint: ${context.sprintStatus?.name || 'None active'}

Recent chat:
${slimConvo || 'None'}`;
};
