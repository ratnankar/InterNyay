package com.internyay.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// Admin request to add or change a dropdown choice
public class OptionItemRequest {

    // Needed when adding
    public String listKey;

    // Parent choice for cascading lists
    public String parent;

    @NotBlank(message = "Enter a name")
    @Size(max = 255, message = "Name is too long")
    public String label;

    // Saved text; left out for lists where it is fixed, and then taken from the label when adding
    @Size(max = 255, message = "Name is too long")
    public String value;

    // Hide or show the choice
    public Boolean enabled;
}
