import { sequence, send, wait } from '@dripctl/sdk';

/**
 * DripCtl sequence for the SwarmLab lead magnet.
 *
 * Trigger this from the landing page with event type:
 *   swarmlab.lead.signup
 *
 * Template copy lives in:
 *   ../templates/swarmlab-green-is-not-correct.json
 */
export const swarmlabGreenIsNotCorrect = sequence('swarmlab-green-is-not-correct', {
  trigger: 'swarmlab.lead.signup',
  optimize: {
    level: 'suggestions',
    bounds: {
      timing: '±12 hours',
      templates: true,
      addSteps: false,
      removeSteps: false,
    },
  },
  steps: [
    send('welcome', {
      template: 'swarmlab-green-not-correct-welcome',
      subject: 'The lab where AI teams fail on purpose',
    }),
    wait('1 day'),
    send('lesson-1-green-is-not-correct', {
      template: 'swarmlab-green-not-correct-lesson-1',
      subject: 'Green is not correct',
    }),
    wait('1 day'),
    send('lesson-2-confident-liar', {
      template: 'swarmlab-green-not-correct-lesson-2',
      subject: 'The confident liar does not need to lie',
    }),
    wait('1 day'),
    send('lesson-3-rubber-stamp-review', {
      template: 'swarmlab-green-not-correct-lesson-3',
      subject: 'More reviewers can make work worse',
    }),
    wait('1 day'),
    send('lesson-4-overnight-rot', {
      template: 'swarmlab-green-not-correct-lesson-4',
      subject: 'Overnight work rots',
    }),
    wait('1 day'),
    send('lesson-5-memory-drift', {
      template: 'swarmlab-green-not-correct-lesson-5',
      subject: 'A fact can be everywhere and wrong',
    }),
    wait('1 day'),
    send('lesson-6-semantic-handoff', {
      template: 'swarmlab-green-not-correct-lesson-6',
      subject: 'Same word, different meaning',
    }),
    wait('1 day'),
    send('lesson-7-receipts', {
      template: 'swarmlab-green-not-correct-lesson-7',
      subject: '“I did it” is not a receipt',
    }),
    wait('1 day'),
    send('checklist', {
      template: 'swarmlab-green-not-correct-checklist',
      subject: 'The false-green checklist',
    }),
  ],
});

export default swarmlabGreenIsNotCorrect;
