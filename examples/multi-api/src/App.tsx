import { useQuery } from "@tanstack/react-query";
import { magia } from "./lib/magia";

export function Dashboard() {
  // REST — fully typed from OpenAPI
  const { data: pets } = useQuery(
    magia.petstore.findPetsByStatus.queryOptions({ status: "available" }),
  );

  // GraphQL — same API surface
  const { data: user } = useQuery(magia.github.GetUser.queryOptions({ login: "octocat" }));

  return (
    <div>
      <section>
        <h2>Available Pets</h2>
        <ul>
          {pets?.map((pet) => (
            <li key={pet.id}>{pet.name}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>GitHub User</h2>
        <p>{user?.user?.name}</p>
        <img src={user?.user?.avatarUrl} alt={user?.user?.name ?? ""} />
      </section>
    </div>
  );
}
