"use client";

import { useEffect, useState } from "react";

interface City {
  id: number;
  name: string;
  state: string;
  price_min: number;
  price_max: number;
  last_scanned: string | null;
  listing_count: number;
}

export default function CitiesPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    state: "",
    price_min: 100000,
    price_max: 1500000,
  });

  useEffect(() => {
    fetchCities();
  }, []);

  async function fetchCities() {
    try {
      const response = await fetch("/api/cities");
      if (response.ok) {
        setCities(await response.json());
      }
    } catch (error) {
      console.error("Failed to fetch cities:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddCity() {
    if (!formData.name || !formData.state) {
      alert("City and state are required");
      return;
    }

    try {
      const response = await fetch("/api/cities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setFormData({ name: "", state: "", price_min: 100000, price_max: 1500000 });
        setShowModal(false);
        await fetchCities();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to add city");
      }
    } catch (error) {
      console.error("Failed to add city:", error);
      alert("Error adding city");
    }
  }

  async function handleDeleteCity(id: number) {
    if (!confirm("Delete this city?")) return;

    try {
      await fetch(`/api/cities/${id}`, { method: "DELETE" });
      await fetchCities();
    } catch (error) {
      console.error("Failed to delete city:", error);
    }
  }

  return (
    <div className="p-8" style={{ backgroundColor: "var(--background)" }}>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">Target Cities</h1>
        <button
          onClick={() => setShowModal(true)}
          disabled={cities.length >= 5}
          style={{ opacity: cities.length >= 5 ? 0.5 : 1 }}
        >
          + Add City
        </button>
      </div>

      {cities.length >= 5 && (
        <div
          className="mb-4 p-4 rounded-lg text-sm"
          style={{
            backgroundColor: "var(--surface-elevated)",
            color: "var(--text-tertiary)",
          }}
        >
          Maximum 5 cities reached
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--text-secondary)" }}>Loading...</p>
      ) : cities.length === 0 ? (
        <div
          className="rounded-lg p-8 text-center"
          style={{ backgroundColor: "var(--card)" }}
        >
          <p style={{ color: "var(--text-tertiary)" }}>
            No cities added yet. Click "Add City" to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cities.map((city) => (
            <div
              key={city.id}
              className="rounded-lg p-6 border"
              style={{
                backgroundColor: "var(--card)",
                borderColor: "var(--border)",
              }}
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-lg font-bold">
                    {city.name}, {city.state}
                  </h3>
                  <p style={{ color: "var(--text-secondary)" }} className="text-sm">
                    ${(city.price_min / 1000).toFixed(0)}K – ${(city.price_max / 1000).toFixed(0)}K
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteCity(city.id)}
                  style={{
                    backgroundColor: "transparent",
                    color: "var(--text-secondary)",
                    padding: "0.5rem",
                    minWidth: "auto",
                  }}
                >
                  ×
                </button>
              </div>
              <p style={{ color: "var(--text-tertiary)" }} className="text-sm">
                Last scanned: {city.last_scanned ? new Date(city.last_scanned).toLocaleDateString() : "Never"}
              </p>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/50"
          onClick={() => setShowModal(false)}
        >
          <div
            className="rounded-lg p-8 w-full max-w-md"
            style={{ backgroundColor: "var(--card)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold mb-4">Add City</h2>

            <div className="mb-4">
              <label style={{ color: "var(--text-secondary)" }} className="text-sm">
                City
              </label>
              <input
                type="text"
                placeholder="e.g., Tampa"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full mt-1"
              />
            </div>

            <div className="mb-4">
              <label style={{ color: "var(--text-secondary)" }} className="text-sm">
                State
              </label>
              <input
                type="text"
                placeholder="e.g., FL"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="w-full mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label style={{ color: "var(--text-secondary)" }} className="text-sm">
                  Min Price
                </label>
                <input
                  type="number"
                  value={formData.price_min}
                  onChange={(e) => setFormData({ ...formData, price_min: parseInt(e.target.value) })}
                  className="w-full mt-1"
                />
              </div>
              <div>
                <label style={{ color: "var(--text-secondary)" }} className="text-sm">
                  Max Price
                </label>
                <input
                  type="number"
                  value={formData.price_max}
                  onChange={(e) => setFormData({ ...formData, price_max: parseInt(e.target.value) })}
                  className="w-full mt-1"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleAddCity}
                style={{ flex: 1 }}
              >
                Add City
              </button>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  flex: 1,
                  backgroundColor: "var(--secondary)",
                  color: "var(--foreground)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
