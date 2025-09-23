defmodule RsolvLandingWeb.FunWithFlagsHelper do
  @moduledoc """
  Helper module for testing with FunWithFlags in Ecto sandbox mode.
  
  FunWithFlags has known issues with Ecto sandbox mode because it tries to
  query the database from separate processes. This helper provides utilities
  to work around these issues in tests.
  """
  
  @doc """
  Ensures FunWithFlags is properly initialized for a test.
  
  Call this in your test setup to avoid sandbox issues:
  
      setup do
        FunWithFlagsHelper.setup_flags()
        :ok
      end
  """
  def setup_flags do
    # Ensure we're in shared mode for FunWithFlags queries
    :ok = Ecto.Adapters.SQL.Sandbox.checkout(RsolvLanding.Repo)
    Ecto.Adapters.SQL.Sandbox.mode(RsolvLanding.Repo, {:shared, self()})
    
    # Clear any cached flags
    if function_exported?(FunWithFlags.Store.Cache, :flush, 0) do
      FunWithFlags.Store.Cache.flush()
    end
    
    :ok
  end
  
  @doc """
  Enables a feature flag for testing, handling sandbox issues.
  """
  def enable_flag(flag) when is_atom(flag) do
    # Ensure shared mode
    Ecto.Adapters.SQL.Sandbox.mode(RsolvLanding.Repo, {:shared, self()})
    
    # Enable the flag
    :ok = FunWithFlags.enable(flag)
    
    # Clear cache to ensure the change is visible
    if function_exported?(FunWithFlags.Store.Cache, :flush, 0) do
      FunWithFlags.Store.Cache.flush()
    end
    
    :ok
  end
  
  @doc """
  Disables a feature flag for testing, handling sandbox issues.
  """
  def disable_flag(flag) when is_atom(flag) do
    # Ensure shared mode
    Ecto.Adapters.SQL.Sandbox.mode(RsolvLanding.Repo, {:shared, self()})
    
    # Disable the flag
    :ok = FunWithFlags.disable(flag)
    
    # Clear cache to ensure the change is visible
    if function_exported?(FunWithFlags.Store.Cache, :flush, 0) do
      FunWithFlags.Store.Cache.flush()
    end
    
    :ok
  end
  
  @doc """
  Sets up a flag with group-based access for testing.
  """
  def enable_flag_for_group(flag, group) when is_atom(flag) and is_atom(group) do
    # Ensure shared mode
    Ecto.Adapters.SQL.Sandbox.mode(RsolvLanding.Repo, {:shared, self()})
    
    # First disable globally
    :ok = FunWithFlags.disable(flag)
    
    # Then enable for the group
    :ok = FunWithFlags.enable(flag, for_group: group)
    
    # Clear cache
    if function_exported?(FunWithFlags.Store.Cache, :flush, 0) do
      FunWithFlags.Store.Cache.flush()
    end
    
    :ok
  end
  
  @doc """
  Clears all flags for a clean test state.
  """
  def clear_all_flags do
    # Ensure shared mode
    Ecto.Adapters.SQL.Sandbox.mode(RsolvLanding.Repo, {:shared, self()})
    
    # Get all flags and clear them
    case FunWithFlags.all_flags() do
      {:ok, flags} ->
        Enum.each(flags, fn flag ->
          FunWithFlags.clear(flag.name)
        end)
        
      _ ->
        :ok
    end
    
    # Clear cache
    if function_exported?(FunWithFlags.Store.Cache, :flush, 0) do
      FunWithFlags.Store.Cache.flush()
    end
    
    :ok
  end
  
  @doc """
  Alternative approach: Use static configuration in tests instead of FunWithFlags.
  
  This can be called in test setup to bypass FunWithFlags entirely:
  
      setup do
        FunWithFlagsHelper.use_static_flags()
        :ok
      end
  """
  def use_static_flags do
    # Configure the app to use static flags only
    Application.put_env(:rsolv_landing, :use_static_flags_only, true)
    :ok
  end
end