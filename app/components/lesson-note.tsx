import { useFetcher } from "react-router";
import { Lock, NotebookPen } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { formatRelativeTime } from "~/lib/utils";

export type LessonNoteData = { body: string; updatedAt: string } | null;

export function LessonNote({ note }: { note: LessonNoteData }) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const isSaving = fetcher.state !== "idle";
  const error = fetcher.data?.error;

  return (
    <Card className="mb-8 gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <NotebookPen className="size-4 text-muted-foreground" />
          Your notes
        </CardTitle>
        <CardDescription className="flex items-center gap-1.5">
          <Lock className="size-3" />
          Only you can read these.
        </CardDescription>
      </CardHeader>

      <fetcher.Form method="post" className="flex flex-col gap-4">
        <input type="hidden" name="intent" value="save-note" />
        <CardContent>
          <Textarea
            name="body"
            aria-label="Your notes"
            defaultValue={note?.body ?? ""}
            placeholder="Jot down what you want to remember from this lesson."
            className="min-h-32 resize-y bg-muted/30 leading-relaxed"
          />
        </CardContent>
        <CardFooter className="justify-between gap-3">
          <NoteStatus note={note} error={error} />
          <Button type="submit" size="sm" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save note"}
          </Button>
        </CardFooter>
      </fetcher.Form>
    </Card>
  );
}

function NoteStatus({
  note,
  error,
}: {
  note: LessonNoteData;
  error: string | undefined;
}) {
  if (error) {
    return (
      <span role="alert" className="text-sm text-red-600">
        {error}
      </span>
    );
  }
  if (!note) return <span />;
  return (
    <span suppressHydrationWarning className="text-xs text-muted-foreground">
      Last edited {formatRelativeTime(note.updatedAt)}
    </span>
  );
}
