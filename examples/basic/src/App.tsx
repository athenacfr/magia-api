import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { magia } from './magia'

function PetList() {
  const { data: pets, isLoading, error } = useQuery(
    magia.petstore.findPetsByStatus.queryOptions({ status: 'available' }),
  )

  if (isLoading) return <p>Loading pets...</p>
  if (error) return <p>Error: {(error as Error).message}</p>

  return (
    <div>
      <h2>Available Pets ({pets?.length ?? 0})</h2>
      <ul>
        {pets?.slice(0, 10).map((pet: any) => (
          <li key={pet.id}>
            <strong>{pet.name}</strong> (id: {pet.id})
          </li>
        ))}
      </ul>
      {pets && pets.length > 10 && <p>...and {pets.length - 10} more</p>}
    </div>
  )
}

function PetDetail({ petId }: { petId: number }) {
  const { data: pet, isLoading, error } = useQuery(
    magia.petstore.getPetById.queryOptions({ petId }),
  )

  if (isLoading) return <p>Loading pet #{petId}...</p>
  if (error) return <p>Pet #{petId} not found</p>

  return (
    <div>
      <h2>Pet Detail</h2>
      <pre>{JSON.stringify(pet, null, 2)}</pre>
    </div>
  )
}

function AddPet() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')

  const mutation = useMutation({
    ...magia.petstore.addPet.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: magia.petstore.findPetsByStatus.queryKey(),
      })
      setName('')
    },
  })

  return (
    <div>
      <h2>Add Pet</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!name) return
          mutation.mutate({
            name,
            status: 'available',
            photoUrls: [],
          })
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Pet name"
        />
        <button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Adding...' : 'Add'}
        </button>
      </form>
      {mutation.isSuccess && <p>Added!</p>}
      {mutation.isError && <p>Error: {(mutation.error as Error).message}</p>}
    </div>
  )
}

function QueryKeys() {
  return (
    <div>
      <h2>TanStack Query Integration</h2>
      <pre>
        {`// queryKey (with input)
${JSON.stringify(magia.petstore.getPetById.queryKey({ petId: 1 }))}

// queryKey (without input — for partial invalidation)
${JSON.stringify(magia.petstore.getPetById.queryKey())}

// mutationKey
${JSON.stringify(magia.petstore.addPet.mutationKey())}

// pathKey (invalidate all petstore queries)
${JSON.stringify(magia.petstore.pathKey())}
`}
      </pre>
    </div>
  )
}

export function App() {
  const [petId, setPetId] = useState<number | null>(null)

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>magia-api + React + TanStack Query</h1>

      <AddPet />
      <hr />

      <PetList />
      <hr />

      <div>
        <h2>Lookup Pet by ID</h2>
        <input
          type="number"
          placeholder="Pet ID"
          onChange={(e) => setPetId(e.target.value ? Number(e.target.value) : null)}
        />
      </div>
      {petId && <PetDetail petId={petId} />}
      <hr />

      <QueryKeys />
    </div>
  )
}
