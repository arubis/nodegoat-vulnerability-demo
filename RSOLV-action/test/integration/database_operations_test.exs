defmodule Rsolv.Integration.DatabaseOperationsTest do
  use Rsolv.DataCase
  
  alias Rsolv.{Analytics, EarlyAccess, EmailManagement, Feedback}
  
  describe "Analytics operations" do
    test "tracks events and retrieves them" do
      # Create an event
      attrs = %{
        event_type: "page_view",
        visitor_id: "test-visitor-123",
        page_path: "/pricing",
        referrer: "https://google.com",
        utm_source: "google",
        utm_medium: "cpc",
        metadata: %{test: true}
      }
      
      assert {:ok, event} = Analytics.create_event(attrs)
      assert event.event_type == "page_view"
      assert event.visitor_id == "test-visitor-123"
      
      # Query events
      events = Analytics.list_events()
      assert length(events) >= 1
      
      # Query by date range
      today = Date.utc_today()
      tomorrow = Date.add(today, 1)
      events_today = Analytics.events_between(today, tomorrow)
      assert length(events_today) >= 1
    end
    
    test "aggregates analytics data" do
      # Create multiple events
      for i <- 1..5 do
        Analytics.create_event(%{
          event_type: "conversion",
          visitor_id: "visitor-#{i}",
          page_path: "/signup",
          metadata: %{plan: "pro"}
        })
      end
      
      # Get conversion count
      conversions = Analytics.count_events_by_type("conversion")
      assert conversions >= 5
    end
  end
  
  describe "Early Access operations" do
    test "creates and retrieves signups" do
      attrs = %{
        email: "test@example.com",
        first_name: "Test",
        source: "landing_page",
        metadata: %{interested_in: "automation"}
      }
      
      assert {:ok, signup} = EarlyAccess.create_signup(attrs)
      assert signup.email == "test@example.com"
      
      # Check if email exists
      assert EarlyAccess.email_exists?("test@example.com")
      refute EarlyAccess.email_exists?("nonexistent@example.com")
      
      # List signups
      signups = EarlyAccess.list_signups()
      assert length(signups) >= 1
    end
  end
  
  describe "Email Management operations" do
    test "tracks unsubscribes" do
      attrs = %{
        email: "unsubscribe@example.com",
        reason: "Too many emails"
      }
      
      assert {:ok, unsubscribe} = EmailManagement.create_unsubscribe(attrs)
      assert unsubscribe.email == "unsubscribe@example.com"
      
      # Check if unsubscribed
      assert EmailManagement.is_unsubscribed?("unsubscribe@example.com")
      refute EmailManagement.is_unsubscribed?("active@example.com")
    end
    
    test "records failed emails" do
      attrs = %{
        to_email: "bounce@example.com",
        template: "welcome_email",
        error_message: "Mailbox does not exist",
        email_data: %{smtp_code: 550}
      }
      
      assert {:ok, failed} = EmailManagement.create_failed_email(attrs)
      assert failed.error_message == "Mailbox does not exist"
      
      # List failed emails
      failed_emails = EmailManagement.list_failed_emails()
      assert length(failed_emails) >= 1
    end
  end
  
  describe "Feedback operations" do
    test "stores and retrieves feedback" do
      attrs = %{
        source: "early_access_form",
        content: %{
          email: "feedback@example.com",
          message: "Looking forward to using RSOLV!"
        },
        metadata: %{
          user_agent: "Mozilla/5.0",
          ip_address: "127.0.0.1"
        }
      }
      
      assert {:ok, feedback} = Feedback.create_entry(attrs)
      assert feedback.source == "early_access_form"
      
      # Count entries
      count = Feedback.count_entries()
      assert count >= 1
      
      # List recent
      recent = Feedback.list_recent_entries(5)
      assert length(recent) >= 1
    end
  end
  
  describe "Cross-context operations" do
    test "coordinates between contexts" do
      email = "integrated@example.com"
      
      # 1. User signs up for early access
      {:ok, _signup} = EarlyAccess.create_signup(%{
        email: email,
        source: "homepage"
      })
      
      # 2. Track analytics event
      {:ok, _event} = Analytics.create_event(%{
        event_type: "conversion",
        visitor_id: "visitor-integrated",
        metadata: %{email: email}
      })
      
      # 3. User provides feedback
      {:ok, _feedback} = Feedback.create_entry(%{
        source: "survey",
        content: %{email: email, rating: 5}
      })
      
      # 4. Later, user unsubscribes
      {:ok, _unsub} = EmailManagement.create_unsubscribe(%{
        email: email,
        reason: "No longer interested"
      })
      
      # Verify all operations succeeded and data is consistent
      assert EarlyAccess.email_exists?(email)
      assert EmailManagement.is_unsubscribed?(email)
      assert Analytics.count_events_by_type("conversion") >= 1
      assert Feedback.count_entries() >= 1
    end
  end
end