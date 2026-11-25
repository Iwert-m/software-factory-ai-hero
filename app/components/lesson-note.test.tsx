import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { LessonNote, type LessonNoteData } from "./lesson-note";

function render(note: LessonNoteData) {
  const Stub = createRoutesStub([
    { path: "/", Component: () => <LessonNote note={note} /> },
  ]);
  return renderToString(<Stub initialEntries={["/"]} />);
}

describe("LessonNote", () => {
  it("shows an empty notes box when the Student has no note", () => {
    const html = render(null);

    expect(html).toContain("Your notes");
    expect(html).toContain("Only you can read these.");
    expect(html).toMatch(/<textarea[^>]*name="body"[^>]*><\/textarea>/);
    expect(html).not.toContain("Last edited");
  });

  it("fills the box with the saved note and says when it was edited", () => {
    const html = render({
      body: "Result types beat exceptions",
      updatedAt: new Date().toISOString(),
    });

    expect(html).toMatch(
      /<textarea[^>]*>Result types beat exceptions<\/textarea>/
    );
    expect(html).toContain("Last edited");
  });

  it("posts the save-note intent with a Save note button", () => {
    const html = render(null);

    expect(html).toMatch(/<form[^>]*method="post"/);
    expect(html).toContain('name="intent" value="save-note"');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Save note<\/button>/);
  });
});
