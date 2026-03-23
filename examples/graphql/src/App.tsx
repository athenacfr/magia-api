import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { magia } from "./lib/magia";

export function UserProfile({ login }: { login: string }) {
  const { data: user, isLoading } = useQuery(magia.github.GetUser.queryOptions({ login }));

  const queryClient = useQueryClient();

  const { mutate } = useMutation({
    ...magia.github.CreateIssue.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: magia.github.GetUser.queryKey({ login }),
      });
    },
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <img src={user?.user?.avatarUrl} alt={user?.user?.name ?? ""} />
      <h1>{user?.user?.name}</h1>
      <ul>
        {user?.user?.repositories?.nodes?.map((repo) => (
          <li key={repo?.name}>
            {repo?.name} ({repo?.stargazerCount} stars)
            <button
              onClick={() =>
                mutate({ input: { repositoryId: repo?.name ?? "", title: "New issue" } })
              }
            >
              Create Issue
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
