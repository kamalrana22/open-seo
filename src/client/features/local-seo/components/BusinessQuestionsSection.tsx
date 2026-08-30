import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { getBusinessQuestions } from "@/serverFunctions/local-seo";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type { BusinessTarget } from "@/client/features/local-seo/localSeoPageTypes";

type Props = {
  projectId: string;
  target: BusinessTarget & { near: { latitude: number; longitude: number } };
};

export function BusinessQuestionsSection({ projectId, target }: Props) {
  const [requested, setRequested] = useState(false);

  const questionsQuery = useQuery({
    queryKey: [
      "local-seo-questions",
      projectId,
      target.identifier,
      target.near,
    ],
    queryFn: () =>
      getBusinessQuestions({
        data: { projectId, ...target.identifier, near: target.near },
      }),
    enabled: requested,
    staleTime: Infinity,
    retry: false,
  });

  const errorMessage = questionsQuery.isError
    ? getStandardErrorMessage(questionsQuery.error)
    : null;
  const isLoading = requested && questionsQuery.isPending;

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-base-content/70">
            Questions &amp; answers
          </h2>
          {!questionsQuery.isSuccess ? (
            <button
              type="button"
              className="btn btn-sm"
              disabled={isLoading}
              onClick={() => setRequested(true)}
            >
              {isLoading ? (
                <span className="loading loading-spinner loading-xs" />
              ) : null}
              {isLoading ? "Loading…" : "Load Q&A (uses credits)"}
            </button>
          ) : null}
        </div>

        {errorMessage ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {!requested ? (
          <p className="text-xs text-base-content/50">
            Unanswered Google Business questions get answered by strangers
            instead of you — load them to see what customers are asking.
          </p>
        ) : null}

        {questionsQuery.isSuccess ? (
          questionsQuery.data.length === 0 ? (
            <p className="text-sm text-base-content/60">
              No questions have been asked on this profile.
            </p>
          ) : (
            <ul className="space-y-3">
              {questionsQuery.data.map((question, index) => (
                <li
                  key={question.questionId ?? index}
                  className="rounded-lg border border-base-300 p-3"
                >
                  <p className="text-sm font-medium">{question.text}</p>
                  <p className="text-xs text-base-content/50">
                    {question.author} · {question.timeAgo} ·{" "}
                    {question.answers.length} answer
                    {question.answers.length === 1 ? "" : "s"}
                  </p>
                  {question.answers.map((answer, answerIndex) => (
                    <p
                      key={answer.answerId ?? answerIndex}
                      className="mt-2 border-l-2 border-base-300 pl-3 text-sm text-base-content/75"
                    >
                      {answer.text}
                      <span className="block text-xs text-base-content/50">
                        {answer.author} · {answer.timeAgo}
                      </span>
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}
