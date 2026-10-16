package com.internyay.service.chat;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// Builds the JSON schema description of a tool for the model
final class ToolSpec {

    private final String name;
    private final String description;
    private final Map<String, Object> properties = new LinkedHashMap<>();
    private final List<String> required = new ArrayList<>();

    // Use of() to create one
    private ToolSpec(String name, String description) {
        this.name = name;
        this.description = description;
    }

    // Start a tool with name and description
    static ToolSpec of(String name, String description) {
        return new ToolSpec(name, description);
    }

    // String parameter
    ToolSpec text(String key, String description) {
        return add(key, "string", description);
    }

    // Integer parameter
    ToolSpec number(String key, String description) {
        return add(key, "integer", description);
    }

    // Boolean parameter
    ToolSpec flag(String key, String description) {
        return add(key, "boolean", description);
    }

    // Date parameter, the format is added to the description
    ToolSpec date(String key, String description) {
        return add(key, "string", description + " Format YYYY-MM-DD.");
    }

    // Mark a parameter as required
    ToolSpec require(String key) {
        required.add(key);
        return this;
    }

    // Final schema map
    Map<String, Object> build() {
        Map<String, Object> schemaProps = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : properties.entrySet()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> prop = new LinkedHashMap<>((Map<String, Object>) entry.getValue());
            if (!required.contains(entry.getKey())) {
                prop.put("type", List.of(String.valueOf(prop.get("type")), "null"));
            }
            schemaProps.put(entry.getKey(), prop);
        }

        Map<String, Object> parameters = new LinkedHashMap<>();
        parameters.put("type", "object");
        parameters.put("properties", schemaProps);
        if (!required.isEmpty()) parameters.put("required", required);

        Map<String, Object> function = new LinkedHashMap<>();
        function.put("name", name);
        function.put("description", description);
        function.put("parameters", parameters);

        Map<String, Object> tool = new LinkedHashMap<>();
        tool.put("type", "function");
        tool.put("function", function);
        return tool;
    }

    // Adds a parameter of the given type
    private ToolSpec add(String key, String type, String description) {
        Map<String, Object> prop = new LinkedHashMap<>();
        prop.put("type", type);
        prop.put("description", description);
        properties.put(key, prop);
        return this;
    }
}
