import { logEvent, sanitizeLogMeta } from "../logger";
import { getClaudeModel } from "../claude/claudeModelSelector";
import { extractJson } from "../claude/parseClaudeJson";
import anthropic from "../claude/anthropicClient";
import { thinkingFor } from "../claude/claudeThinking";
import { isCharacterCategory, type CharacterCategory } from "character-chatbot-shared";

/** What the Claude prompt step produces for one character. */
export interface AvatarPromptResult {
  prompt: string;
  gender: string | null;
  category: CharacterCategory | null;
}

/**
 * Asks Claude for an image-generation prompt (plus the character's gender and gallery
 * category) for a name, with a fixed generic-portrait prompt as the fallback if the call
 * or its JSON fails. The prompt deliberately describes an original archetype, never a real
 * person's likeness or a copyrighted design. Never throws.
 */
export async function buildAvatarPrompt(characterName: string): Promise<AvatarPromptResult> {
  let prompt: string;
  let genderOut: string | null = null;
  let categoryOut: CharacterCategory | null = null;
  try {
    logEvent("info", "avatar_prompt_start", "Generating image prompt via Claude");

    const textModel = getClaudeModel("text-simple");
    const promptResponse = await anthropic.messages.create({
      model: textModel,
      thinking: thinkingFor("text-simple"),
      system: `You are an expert at creating concise, unambiguous image-generation prompts for text-to-image models. Produce a deterministic prompt for a single-person portrait suitable for illustrated/stylized rendering. The prompt must explicitly forbid multiple photos, collages, side-by-side images, reflections, split/composite images, multiple exposures, or any duplicates. Also instruct against text overlays, watermarks, logos, captions, or any extraneous elements. You must NEVER request an accurate likeness of a real person (no actor, celebrity, or public figure's actual face or identity) and must NEVER request an exact reproduction of a copyrighted character's specific design (exact costume, logo, or studio-owned visual design). Instead, describe a generic archetype evoked by the name (e.g., broad build, era-appropriate style, general vibe/personality) using original, non-infringing details — enough to be thematically recognizable without copying a specific person's face or a specific copyrighted design. Always return only the requested JSON fields and do not add commentary.`,
      messages: [
        {
          role: "user",
          content: `Create an image generation prompt for a character loosely inspired by "${characterName}".

Do not depict this as a real person or reproduce a specific copyrighted design. Describe a generic, original interpretation that evokes the general archetype/vibe (e.g., role, era, broad style) without copying any real individual's actual face/identity or any studio-owned character design.
Return JSON with these fields (strict JSON only; do not add extra commentary):
- subject: concise physical description of an original/generic character (200 chars max). Include age range and general style; do not describe a specific real person's face or an exact copyrighted design.
- artStyle: visual style (e.g., stylized illustration, digital painting) (50 chars max). Avoid "photorealistic" for real people or copyrighted characters.
- composition: framing and pose guidance (e.g., close-up headshot, 3/4 view) (100 chars max)
- iconicElements: generic props, clothing, or background elements evoking the theme without copying a specific copyrighted design (100 chars max)
- negativePrompts: explicit exclusions to ensure a single, original portrait (150 chars max). Must include: "no collage, no side-by-side photos, no multiple people, single face only, no reflections, no double exposures, no duplicates, no text, no watermark, no logo, no extra limbs, no extra hands, no extra faces, not a real person, no celebrity likeness, no exact copyrighted design".
- gender: character's gender (for voice matching)
- category: choose exactly one stable gallery category identifier:
- "history" for real historical people, including rulers, scientists, artists, writers, political figures, and philosophers
- "mythology" for named figures from a culture's mythology or ancient epic tradition
- "literature" for characters originating in a named written work
- "folklore" for fairy-tale, legendary, or oral-tradition figures without one defining authored work
- "religion" for religious figures, saints, prophets, and theologians
Always pick the best fit of these five; never leave it blank. Fictional characters from a book, play, or poem are "literature" even when famous elsewhere (Sherlock Holmes, Hamlet). Fairy-tale figures with no single defining author are "folklore" (Cinderella). Real people, philosophers included, are "history" unless best known as a religious figure.`,
        },
      ],
      max_tokens: 700,
    });

    const rawContent = extractJson(
      promptResponse.content[0]?.type === "text" ? promptResponse.content[0].text : "{}",
    );
    const promptData = JSON.parse(rawContent);

    genderOut = promptData.gender || null;
    categoryOut = isCharacterCategory(promptData.category) ? promptData.category : null;

    prompt =
      `Original, stylized character illustration loosely inspired by the name "${characterName}", not a depiction of any real person and not an exact reproduction of any copyrighted character design. ${promptData.subject || ""}. ${promptData.iconicElements || ""}. ${promptData.composition || ""}. Style: ${promptData.artStyle || "stylized illustration"}. single, solo, alone, centered, close-up portrait, no other people. Exclude: ${promptData.negativePrompts || "multiple people, extra faces, duplicates, real person likeness, exact copyrighted design"}`.trim();

    if (prompt.length > 1000) {
      prompt = prompt.slice(0, 1000);
    }

    logEvent(
      "info",
      "avatar_prompt_generated",
      "Generated image prompt",
      sanitizeLogMeta({ prompt, gender: genderOut }),
    );
  } catch (promptErr) {
    prompt = `Original, stylized character illustration loosely inspired by the name "${characterName}", depicting a generic archetype rather than any real person's actual likeness or any specific copyrighted character design. Single subject, one person, one face; head-and-shoulders portrait (frontal or 3/4) with neutral background and even soft lighting. Do NOT create collages, side-by-side photos, split/composite images, reflections, or duplicates. Exclude text, watermarks, logos, extra limbs, extra faces, real-person likeness, exact copyrighted designs, or any compositing.`;
    logEvent(
      "warn",
      "avatar_prompt_fallback",
      "Failed to generate dynamic image prompt, using fallback",
      sanitizeLogMeta({
        prompt,
        error: promptErr instanceof Error ? promptErr.message : String(promptErr),
      }),
    );
  }

  return { prompt, gender: genderOut, category: categoryOut };
}
